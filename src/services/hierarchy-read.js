import { loadPaginationConfig } from '../config/data.js';
import { requireRead as authorize } from '../policy/canRead.js';
import { jurisdictionWhere } from '../policy/readWhere.js';
export { jurisdictionWhere } from '../policy/readWhere.js';
import {
  reportingMeters,
  pageLatestReadings,
  operationalReading,
} from './operational.js';
import { loadOperationalConfig } from '../config/data.js';
import { now } from '../utils/clock.js';
import { resolveHierarchy, parseId } from './hierarchy.js';
import { serialize } from '../serializers/index.js';
import {
  parsePagination,
  queryInteger,
  invalidQuery,
  collectionEnvelope,
} from '../utils/pagination.js';
import { parseSort } from '../utils/sort.js';

const resources = {
  province: { model: 'province', key: 'province_id' },
  district: { model: 'district', key: 'district_id' },
  substation: { model: 'gridSubstation', key: 'substation_id' },
  installation: { model: 'solarInstallation', key: 'site_id' },
};
const filters = {
  province_id: 'province',
  district_id: 'district',
  substation_id: 'substation',
};
function filterWhere(field, id) {
  if (field === 'substation_id') return { substation_id: id };
  return {
    substation:
      field === 'province_id'
        ? { district: { province_id: id } }
        : { district_id: id },
  };
}
export function validateListQuery(
  query,
  resource,
  { allowFilters = false, paginationConfig } = {},
) {
  const allowed = [
    'page',
    'page_size',
    'sort',
    ...(allowFilters ? Object.keys(filters) : []),
    ...(resource === 'installation' ? ['reporting', 'include'] : []),
  ];
  for (const key of Object.keys(query))
    if (!allowed.includes(key))
      throw invalidQuery('query', 'contains an unsupported parameter');
  const pagination = parsePagination(
    query,
    paginationConfig ?? loadPaginationConfig(),
  );
  const orderBy = parseSort(query.sort, resources[resource].key);
  const parsedFilters = Object.fromEntries(
    Object.keys(filters)
      .filter((field) => query[field] !== undefined)
      .map((field) => [field, queryInteger(query[field], field)]),
  );
  if (
    query.reporting !== undefined &&
    !['true', 'false'].includes(query.reporting)
  )
    throw invalidQuery('reporting', 'must be true or false');
  if (query.include !== undefined && query.include !== 'last_known_reading')
    throw invalidQuery('include', 'must be last_known_reading');
  return {
    pagination,
    orderBy,
    filters: parsedFilters,
    reporting: query.reporting,
    include: query.include,
  };
}
export async function getAtomic(db, principal, resource, id) {
  const chain = await resolveHierarchy(db, resource, parseId(id));
  authorize(principal, chain);
  return serialize(resource, chain.row);
}
export async function getCollection(db, req, resource, options = {}) {
  const parsed = validateListQuery(req.query, resource, options);
  const predicates = [jurisdictionWhere(req.principal, resource)];
  if (options.parent) {
    const { level, param } = options.parent;
    const id = parseId(req.params[param]);
    const parent = await resolveHierarchy(db, level, id);
    authorize(req.principal, parent);
    const field = resources[level].key;
    predicates.push({ [field]: id });
  }
  for (const [field, id] of Object.entries(parsed.filters)) {
    const chain = await resolveHierarchy(db, filters[field], id);
    authorize(req.principal, chain);
    predicates.push(filterWhere(field, id));
  }
  if (
    resource === 'installation' &&
    (parsed.reporting !== undefined || parsed.include !== undefined)
  ) {
    const clockTime = (options.clock ?? now)();
    const { staleAfterMinutes } = loadOperationalConfig();
    return db.$transaction(
      async (tx) => {
        if (parsed.reporting !== undefined) {
          const meters = await reportingMeters(
            tx,
            req.principal,
            {
              filters: parsed.filters,
              substationId: options.parent
                ? parseId(req.params[options.parent.param])
                : undefined,
            },
            clockTime,
            staleAfterMinutes,
          );
          predicates.push({
            meter_id:
              parsed.reporting === 'true' ? { in: meters } : { notIn: meters },
          });
        }
        const where = { AND: predicates };
        const count = await tx.solarInstallation.count({ where });
        const rows = await tx.solarInstallation.findMany({
          where,
          orderBy: parsed.orderBy,
          skip: parsed.pagination.skip,
          take: parsed.pagination.pageSize,
        });
        const latest = parsed.include
          ? await pageLatestReadings(
              tx,
              rows.map((row) => row.meter_id),
            )
          : null;
        const data = rows.map((row) => ({
          ...serialize('installation', row),
          ...(latest
            ? {
                last_known_reading: operationalReading(
                  latest.get(row.meter_id),
                  clockTime,
                  { compact: true, staleAfterMinutes },
                ),
              }
            : {}),
        }));
        return collectionEnvelope(req, data, count, parsed.pagination);
      },
      { isolationLevel: 'RepeatableRead', timeout: 15000, maxWait: 10000 },
    );
  }
  const model = db[resources[resource].model];
  const where = { AND: predicates };
  const [count, rows] = await db.$transaction(
    [
      model.count({ where }),
      model.findMany({
        where,
        orderBy: parsed.orderBy,
        skip: parsed.pagination.skip,
        take: parsed.pagination.pageSize,
      }),
    ],
    { isolationLevel: 'RepeatableRead' },
  );
  return collectionEnvelope(
    req,
    rows.map((row) => serialize(resource, row)),
    count,
    parsed.pagination,
  );
}
