import { Prisma } from '../generated/prisma/client.js';
import { loadOperationalConfig } from '../config/data.js';
import { requireRegionalRead } from '../policy/canRead.js';
import { regionPredicate } from '../policy/readWhere.js';
import { parseId, resolveHierarchy } from './hierarchy.js';
import { startOfLocalDay } from '../utils/time.js';
import { now } from '../utils/clock.js';
import { invalidQuery } from '../utils/pagination.js';
export { regionPredicate } from '../policy/readWhere.js';

export async function resolveRegion(db, principal, { type, id } = {}) {
  if (!type) {
    if (principal.jurisdiction_type === 'national')
      return { type: 'national', id: null, name: 'Sri Lanka' };
    type =
      principal.jurisdiction_type === 'provincial' ? 'province' : 'district';
    id = String(principal.jurisdiction_id);
  }
  const chain = await resolveHierarchy(db, type, parseId(id));
  requireRegionalRead(principal, chain, type);
  return {
    type,
    id: chain.row[
      {
        province: 'province_id',
        district: 'district_id',
        substation: 'substation_id',
        installation: 'site_id',
      }[type]
    ],
    name: chain.row.name,
  };
}

export async function regionalSnapshot(
  db,
  scope,
  clockTime,
  { staleAfterMinutes = loadOperationalConfig().staleAfterMinutes } = {},
) {
  const midnight = startOfLocalDay(clockTime);
  const cutoff = new Date(clockTime.getTime() - staleAfterMinutes * 60000);
  const lookback = new Date(clockTime.getTime() - 48 * 3600000);
  const predicate = regionPredicate(scope);
  const [result] = await db.$queryRaw(Prisma.sql`
WITH meters AS (
 SELECT i.meter_id FROM solar_installations i
 JOIN grid_substations g ON g.substation_id = i.substation_id
 JOIN districts d ON d.district_id = g.district_id WHERE ${predicate}
), latest AS (
 SELECT DISTINCT ON (r.meter_id) r.meter_id, r.timestamp, r.power_kw, r.cumulative_energy_kwh AS e_last
 FROM generation_readings r JOIN meters m ON m.meter_id = r.meter_id
 WHERE r.timestamp > ${lookback}::timestamptz AND r.timestamp <= ${clockTime}::timestamptz
 ORDER BY r.meter_id, r.timestamp DESC
), baseline AS (
 SELECT DISTINCT ON (r.meter_id) r.meter_id, r.cumulative_energy_kwh AS e_base
 FROM generation_readings r JOIN meters m ON m.meter_id = r.meter_id
 WHERE r.timestamp < ${midnight}::timestamptz ORDER BY r.meter_id, r.timestamp DESC
), first_today AS (
 SELECT DISTINCT ON (r.meter_id) r.meter_id, r.cumulative_energy_kwh AS e_first
 FROM generation_readings r JOIN meters m ON m.meter_id = r.meter_id
 WHERE r.timestamp >= ${midnight}::timestamptz AND r.timestamp <= ${clockTime}::timestamptz
 ORDER BY r.meter_id, r.timestamp ASC
)
SELECT (SELECT count(*) FROM meters)::int AS total,
 (count(*) FILTER (WHERE l.timestamp >= ${cutoff}::timestamptz))::int AS reporting,
 COALESCE(sum(l.power_kw) FILTER (WHERE l.timestamp >= ${cutoff}::timestamptz), 0)::double precision AS total_power,
 COALESCE(sum(GREATEST(l.e_last - COALESCE(b.e_base, f.e_first), 0)) FILTER (WHERE l.timestamp >= ${midnight}::timestamptz), 0)::double precision AS energy_today
FROM latest l LEFT JOIN baseline b ON b.meter_id = l.meter_id
LEFT JOIN first_today f ON f.meter_id = l.meter_id`);
  return {
    installations_total: Number(result.total),
    installations_reporting: Number(result.reporting),
    installations_not_reporting:
      Number(result.total) - Number(result.reporting),
    total_power_Kw: Number(Number(result.total_power).toFixed(3)),
    energy_today_Kwh: Number(Number(result.energy_today).toFixed(3)),
  };
}
export async function generationSummary(
  db,
  req,
  { type, param, clock = now } = {},
) {
  if (Object.keys(req.query).length)
    throw invalidQuery('query', 'contains an unsupported parameter');
  const scope = await resolveRegion(db, req.principal, {
    type,
    id: param ? req.params[param] : undefined,
  });
  const clockTime = clock();
  return {
    scope,
    as_of: clockTime.toISOString(),
    timezone: 'Asia/Colombo',
    ...(await regionalSnapshot(db, scope, clockTime)),
  };
}
