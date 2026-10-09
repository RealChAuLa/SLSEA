import { loadPaginationConfig } from '../config/data.js';
import { canRead } from '../policy/canRead.js';
import { scopeFilter } from '../policy/scopeFilter.js';
import { resolveHierarchy, parseId } from './hierarchy.js';
import { ApiError } from '../errors/api-error.js';
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
function authorize(principal, chain) {
  if (!canRead(principal, chain))
    throw new ApiError(
      'FORBIDDEN_JURISDICTION',
      403,
      'The requested resource is outside your jurisdiction.',
    );
}
export function jurisdictionWhere(principal, resource) {
  const scope = scopeFilter(principal);
  if (scope.type === 'national') return {};
  if (resource === 'province')
    return {
      province_id:
        scope.type === 'province'
          ? scope.id
          : (principal.parent_province_id ?? -1),
    };
  if (resource === 'district')
    return scope.type === 'province'
      ? { province_id: scope.id }
      : { district_id: scope.id };
  if (resource === 'substation')
    return scope.type === 'province'
      ? { district: { province_id: scope.id } }
      : { district_id: scope.id };
  return {
    substation:
      scope.type === 'province'
        ? { district: { province_id: scope.id } }
        : { district_id: scope.id },
  };
}
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
  return { pagination, orderBy, filters: parsedFilters };
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
