import { ApiError } from '../errors/api-error.js';
import { requireRead } from '../policy/canRead.js';
import { serializeReading } from '../serializers/readings.js';
export { serializeReading } from '../serializers/readings.js';
import { jurisdictionWhere } from '../policy/readWhere.js';
import { resolveHierarchy, parseId } from './hierarchy.js';
import { parseHistoryQuery, parseTimestamp } from '../utils/read-time.js';
import { collectionEnvelope, invalidQuery } from '../utils/pagination.js';
import { now } from '../utils/clock.js';

export function newestTimestamp(rows) {
  return rows.length
    ? new Date(Math.max(...rows.map((row) => row.timestamp.getTime())))
    : undefined;
}
function installationFilter(field, id) {
  if (field === 'site_id' || field === 'substation_id') return { [field]: id };
  return {
    substation:
      field === 'district_id'
        ? { district_id: id }
        : { district: { province_id: id } },
  };
}
export async function readingCollection(
  db,
  req,
  { root = false, clock = now } = {},
) {
  const parsed = parseHistoryQuery(req.query, { root, clock });
  const predicates = [];
  let site;
  if (root)
    predicates.push({
      installation: jurisdictionWhere(req.principal, 'installation'),
    });
  else {
    site = await resolveHierarchy(
      db,
      'installation',
      parseId(req.params.siteId),
    );
    requireRead(req.principal, site);
    predicates.push({ meter_id: site.row.meter_id });
  }
  for (const [field, { level, id }] of Object.entries(parsed.filters)) {
    const chain = await resolveHierarchy(db, level, id);
    requireRead(req.principal, chain);
    predicates.push({ installation: installationFilter(field, id) });
  }
  if (parsed.from || parsed.to)
    predicates.push({
      timestamp: {
        ...(parsed.from ? { gte: parsed.from } : {}),
        ...(parsed.to ? { lt: parsed.to } : {}),
      },
    });
  const where = { AND: predicates };
  const [count, rows] = await db.$transaction(
    [
      db.generationReading.count({ where }),
      db.generationReading.findMany({
        where,
        orderBy: parsed.orderBy,
        skip: parsed.pagination.skip,
        take: parsed.pagination.pageSize,
        include: { installation: { select: { site_id: true } } },
      }),
    ],
    { isolationLevel: 'RepeatableRead' },
  );
  return {
    body: collectionEnvelope(
      req,
      rows.map((row) => serializeReading(row, row.installation.site_id)),
      count,
      parsed.pagination,
    ),
    lastModified: newestTimestamp(rows),
  };
}
export async function atomicReading(db, req) {
  if (Object.keys(req.query).length)
    throw invalidQuery('query', 'contains an unsupported parameter');
  const id = parseId(req.params.siteId);
  const timestamp = parseTimestamp(req.params.timestamp, { path: true });
  const site = await resolveHierarchy(db, 'installation', id);
  requireRead(req.principal, site);
  const row = await db.generationReading.findUnique({
    where: { meter_id_timestamp: { meter_id: site.row.meter_id, timestamp } },
  });
  if (!row)
    throw new ApiError(
      'NOT_FOUND',
      404,
      'The requested reading was not found.',
    );
  return { body: serializeReading(row, id), lastModified: row.timestamp };
}
