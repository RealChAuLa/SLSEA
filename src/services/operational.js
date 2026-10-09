import { Prisma } from '../generated/prisma/client.js';
import { loadOperationalConfig } from '../config/data.js';
import { installationPredicate } from '../policy/readWhere.js';
import { parseId, resolveHierarchy } from './hierarchy.js';
import { requireRead } from '../policy/canRead.js';
import { serializeReading } from '../serializers/readings.js';
import { serialize } from '../serializers/index.js';
import { startOfLocalDay } from '../utils/time.js';
import { now } from '../utils/clock.js';
import { invalidQuery } from '../utils/pagination.js';
import { ApiError } from '../errors/api-error.js';

export function operationalReading(
  row,
  clockTime,
  { compact = false, siteId, staleAfterMinutes = 30 } = {},
) {
  if (!row) return null;
  const elapsed = Math.max(0, clockTime.getTime() - row.timestamp.getTime());
  const full = {
    ...serializeReading(row, siteId),
    age_seconds: Math.floor(elapsed / 1000),
    is_stale: elapsed > staleAfterMinutes * 60000,
  };
  if (!compact) return full;
  const { site_id, meter_id, ...result } = full;
  // Explicitly omitted IDs in nested representations are already on the parent.
  void site_id;
  void meter_id;
  return result;
}
export async function pageLatestReadings(db, meters) {
  if (!meters.length) return new Map();
  const rows = await db.$queryRaw(
    Prisma.sql`SELECT DISTINCT ON (meter_id) meter_id, timestamp, power_kw AS "power_Kw", cumulative_energy_kwh AS "cumulative_energy_Kwh", voltage FROM generation_readings WHERE meter_id IN (${Prisma.join(meters)}) ORDER BY meter_id, timestamp DESC`,
  );
  return new Map(rows.map((row) => [row.meter_id, row]));
}
export async function reportingMeters(
  db,
  principal,
  options,
  clockTime,
  staleAfterMinutes,
) {
  const predicate = installationPredicate(principal, options);
  const cutoff = new Date(clockTime.getTime() - staleAfterMinutes * 60000);
  const rows = await db.$queryRaw(Prisma.sql`SELECT meter_id FROM (
 SELECT DISTINCT ON (r.meter_id) r.meter_id, r.timestamp
 FROM generation_readings r JOIN solar_installations i ON i.meter_id = r.meter_id
 JOIN grid_substations g ON g.substation_id = i.substation_id
 JOIN districts d ON d.district_id = g.district_id
 WHERE ${predicate} ORDER BY r.meter_id, r.timestamp DESC
 ) latest WHERE timestamp >= ${cutoff}::timestamptz`);
  return rows.map((row) => row.meter_id);
}
function emptyQuery(req) {
  if (Object.keys(req.query).length)
    throw invalidQuery('query', 'contains an unsupported parameter');
}
export async function lastKnown(
  db,
  req,
  {
    clock = now,
    staleAfterMinutes = loadOperationalConfig().staleAfterMinutes,
  } = {},
) {
  emptyQuery(req);
  const site = await resolveHierarchy(
    db,
    'installation',
    parseId(req.params.siteId),
  );
  requireRead(req.principal, site);
  const row = await db.generationReading.findFirst({
    where: { meter_id: site.row.meter_id },
    orderBy: { timestamp: 'desc' },
  });
  if (!row)
    throw new ApiError('NOT_FOUND', 404, 'The installation has no readings.');
  return {
    body: operationalReading(row, clock(), {
      siteId: site.site_id,
      staleAfterMinutes,
    }),
    lastModified: row.timestamp,
  };
}
export async function overview(
  db,
  req,
  {
    clock = now,
    staleAfterMinutes = loadOperationalConfig().staleAfterMinutes,
  } = {},
) {
  emptyQuery(req);
  const site = await resolveHierarchy(
    db,
    'installation',
    parseId(req.params.siteId),
  );
  requireRead(req.principal, site);
  const clockTime = clock();
  const midnight = startOfLocalDay(clockTime);
  const meter_id = site.row.meter_id;
  const todayWhere = { meter_id, timestamp: { gte: midnight, lte: clockTime } };
  const [latest, baseline, first, todayLast, stats] = await db.$transaction(
    [
      db.generationReading.findFirst({
        where: { meter_id },
        orderBy: { timestamp: 'desc' },
      }),
      db.generationReading.findFirst({
        where: { meter_id, timestamp: { lt: midnight } },
        orderBy: { timestamp: 'desc' },
      }),
      db.generationReading.findFirst({
        where: todayWhere,
        orderBy: { timestamp: 'asc' },
      }),
      db.generationReading.findFirst({
        where: todayWhere,
        orderBy: { timestamp: 'desc' },
      }),
      db.generationReading.aggregate({
        where: todayWhere,
        _count: true,
        _max: { power_Kw: true },
      }),
    ],
    { isolationLevel: 'RepeatableRead' },
  );
  const energy = todayLast
    ? Math.max(
        0,
        todayLast.cumulative_energy_Kwh -
          (baseline ?? first).cumulative_energy_Kwh,
      )
    : 0;
  return {
    ...serialize('installation', site.row),
    substation: {
      substation_id: site.substation_id,
      name: site.row.substation_name,
    },
    district: { district_id: site.district_id, name: site.row.district_name },
    province: { province_id: site.province_id, name: site.row.province_name },
    last_known_reading: operationalReading(latest, clockTime, {
      compact: true,
      staleAfterMinutes,
    }),
    today: {
      energy_Kwh: Number(energy.toFixed(3)),
      peak_power_Kw: stats._max.power_Kw ?? 0,
      reading_count: stats._count,
    },
  };
}
