import assert from 'node:assert/strict';
import { floorQuarterHour, generateSeries, QUARTER_HOUR } from './generator.js';
import { now } from '../../src/utils/clock.js';

export async function selfCheckReadings(db, dataset, { end, count }) {
  const rows =
    await db.$queryRaw`SELECT meter_id, COUNT(*)::int AS count, MIN(timestamp) AS first, MAX(timestamp) AS last FROM generation_readings GROUP BY meter_id`;
  const byMeter = new Map(rows.map((row) => [row.meter_id, row]));
  let total = 0;
  for (const site of dataset.installations) {
    const empty = site.site_id === dataset.fixtures.emptySiteId;
    const offline = site.site_id === dataset.fixtures.offlineSiteId;
    const expected = empty ? 0 : count - (offline ? 24 : 0);
    const row = byMeter.get(site.meter_id);
    assert.equal(row?.count ?? 0, expected, 'Seed reading count is incorrect.');
    if (!empty) {
      assert.equal(
        row.first.getTime(),
        end.getTime() - (count - 1) * QUARTER_HOUR,
        'Seed start is incorrect.',
      );
      assert.equal(
        row.last.getTime(),
        end.getTime() - (offline ? 24 : 0) * QUARTER_HOUR,
        'Offline gap or seed end is incorrect.',
      );
    }
    total += expected;
  }
  assert.equal(
    rows.length,
    dataset.installations.length - 1,
    'Unexpected meter in seed.',
  );
  const bad = await db.$queryRaw`SELECT COUNT(*)::int AS count FROM (
 SELECT timestamp, power_kw, cumulative_energy_kwh, voltage,
 LAG(cumulative_energy_kwh) OVER (PARTITION BY meter_id ORDER BY timestamp) AS previous_energy,
 LAG(timestamp) OVER (PARTITION BY meter_id ORDER BY timestamp) AS previous_timestamp
 FROM generation_readings) r
 WHERE cumulative_energy_kwh < previous_energy OR
 (previous_timestamp IS NOT NULL AND timestamp - previous_timestamp <> interval '15 minutes') OR
 power_kw < 0 OR voltage < 215 OR voltage > 245 OR
 ((EXTRACT(HOUR FROM timestamp AT TIME ZONE 'Asia/Colombo') < 6 OR EXTRACT(HOUR FROM timestamp AT TIME ZONE 'Asia/Colombo') >= 18) AND power_kw <> 0)`;
  assert.equal(
    bad[0].count,
    0,
    'Seed intervals, monotonicity or values are invalid.',
  );
  assert.equal(
    await db.generationReading.count(),
    total,
    'Unexpected seed total.',
  );
  return {
    readings: total,
    perNormalSite: count,
    offlineGapHours: 6,
    seedEnd: end.toISOString(),
  };
}
export async function seedReadings(
  db,
  dataset,
  { scale = 'full', endTimestamp = now(), seedRandom = 20260601 } = {},
) {
  const end = floorQuarterHour(endTimestamp);
  const count = scale === 'test' ? 192 : 672;
  let batch = [];
  await db.$transaction(
    async (tx) => {
      for (const site of dataset.installations) {
        if (site.site_id === dataset.fixtures.emptySiteId) continue;
        let rows = generateSeries({
          site_id: site.site_id,
          meter_id: site.meter_id,
          endTimestamp: end,
          count,
          seedRandom,
        });
        if (site.site_id === dataset.fixtures.offlineSiteId)
          rows = rows.slice(0, -24);
        for (const row of rows) {
          batch.push(row);
          if (batch.length === 5000) {
            await tx.generationReading.createMany({ data: batch });
            batch = [];
          }
        }
      }
      if (batch.length) await tx.generationReading.createMany({ data: batch });
    },
    { timeout: 120000, maxWait: 10000 },
  );
  const summary = await selfCheckReadings(db, dataset, { end, count });
  return { end, count, ...summary };
}
