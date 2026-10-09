import { Prisma } from '../generated/prisma/client.js';
import { regionPredicate } from '../policy/readWhere.js';
import { resolveRegion } from './regions.js';
import { parseTrendQuery } from '../utils/trend-query.js';
import { collectionEnvelope } from '../utils/pagination.js';

export async function trendBuckets(db, scope, interval, from, to) {
  if (!['hour', 'day'].includes(interval))
    throw new Error('Invalid trend interval.');
  const predecessorFrom = new Date(from.getTime() - 3600000);
  const rows = await db.$queryRaw(Prisma.sql`
WITH meters AS (
 SELECT i.meter_id FROM solar_installations i
 JOIN grid_substations g ON g.substation_id = i.substation_id
 JOIN districts d ON d.district_id = g.district_id WHERE ${regionPredicate(scope)}
), ordered AS (
 SELECT r.meter_id,r.timestamp,r.cumulative_energy_kwh -
 LAG(r.cumulative_energy_kwh) OVER (PARTITION BY r.meter_id ORDER BY r.timestamp) AS delta
 FROM generation_readings r JOIN meters m ON m.meter_id=r.meter_id
 WHERE r.timestamp >= ${predecessorFrom}::timestamptz AND r.timestamp < ${to}::timestamptz
)
SELECT EXTRACT(EPOCH FROM timezone('Asia/Colombo',date_trunc(${interval}::text,timezone('Asia/Colombo',timestamp))))::bigint AS bucket_epoch,
 COALESCE(SUM(GREATEST(delta,0)),0)::double precision AS energy,
 COUNT(DISTINCT meter_id)::int AS reporting,COUNT(*)::int AS readings
FROM ordered WHERE timestamp >= ${from}::timestamptz
GROUP BY 1 ORDER BY 1`);
  return rows.map((row) => ({
    bucket_start: new Date(Number(row.bucket_epoch) * 1000).toISOString(),
    energy_Kwh: Number(Number(row.energy).toFixed(3)),
    reporting_installations: Number(row.reporting),
    reading_count: Number(row.readings),
  }));
}
export async function generationTrend(db, req, { type, param } = {}) {
  const query = parseTrendQuery(req.query);
  const scope = await resolveRegion(db, req.principal, {
    type,
    id: param ? req.params[param] : undefined,
  });
  const rows = await trendBuckets(
    db,
    scope,
    query.interval,
    query.from,
    query.to,
  );
  const byStart = new Map(rows.map((row) => [row.bucket_start, row]));
  const buckets = query.buckets.map((bucket) => ({
    ...bucket,
    ...byStart.get(bucket.bucket_start),
  }));
  if (query.descending) buckets.reverse();
  const { skip, pageSize } = query.pagination;
  return {
    ...collectionEnvelope(
      req,
      buckets.slice(skip, skip + pageSize),
      buckets.length,
      query.pagination,
    ),
    meta: {
      scope,
      interval: query.interval,
      timezone: 'Asia/Colombo',
      effective_from: query.from.toISOString(),
      effective_to: query.to.toISOString(),
    },
  };
}
