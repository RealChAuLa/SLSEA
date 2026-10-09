import { jest } from '@jest/globals';
import { createTestDatabase } from '../helpers/db.js';
import { extendReadings } from '../../prisma/seed-lib/extend.js';
import {
  generateSeries,
  QUARTER_HOUR,
} from '../../prisma/seed-lib/generator.js';
jest.setTimeout(60000);
let fixture;
const end = new Date('2026-10-09T12:00:00Z');
beforeAll(async () => {
  fixture = await createTestDatabase({
    history: true,
    endTimestamp: new Date(end.getTime() - 2 * QUARTER_HOUR),
  });
});
afterAll(async () => {
  await fixture?.db.$disconnect();
});
test('extension continues deterministic counters, leaves fixtures unchanged and is idempotent', async () => {
  const ids = fixture.dataset.fixtures;
  const fixtureMeters = fixture.dataset.installations
    .filter((row) => [ids.emptySiteId, ids.offlineSiteId].includes(row.site_id))
    .map((row) => row.meter_id);
  const beforeFixtures = await fixture.db.generationReading.findMany({
    where: { meter_id: { in: fixtureMeters } },
    orderBy: [{ meter_id: 'asc' }, { timestamp: 'asc' }],
    take: 1000,
  });
  const site = fixture.dataset.installations.find(
    (row) => row.name === 'Colombo Rooftop Solar 1',
  );
  const previous = await fixture.db.generationReading.findFirst({
    where: { meter_id: site.meter_id },
    orderBy: { timestamp: 'desc' },
  });
  const options = { endTimestamp: end, fixtures: ids };
  expect((await extendReadings(fixture.db, options)).rowsAdded).toBe(
    (fixture.dataset.installations.length - 2) * 2,
  );
  const added = await fixture.db.generationReading.findMany({
    where: { meter_id: site.meter_id, timestamp: { gt: previous.timestamp } },
    orderBy: { timestamp: 'asc' },
    take: 500,
  });
  expect(
    added.map(
      ({ timestamp, power_Kw, cumulative_energy_Kwh, voltage, meter_id }) => ({
        timestamp,
        power_Kw,
        cumulative_energy_Kwh,
        voltage,
        meter_id,
      }),
    ),
  ).toEqual(
    generateSeries({
      site_id: site.site_id,
      meter_id: site.meter_id,
      endTimestamp: end,
      count: 2,
      startEnergy: previous.cumulative_energy_Kwh,
    }),
  );
  expect((await extendReadings(fixture.db, options)).rowsAdded).toBe(0);
  expect(
    await fixture.db.generationReading.findMany({
      where: { meter_id: { in: fixtureMeters } },
      orderBy: [{ meter_id: 'asc' }, { timestamp: 'asc' }],
      take: 1000,
    }),
  ).toEqual(beforeFixtures);
});
test('concurrent extensions do not duplicate rows and do not move counters backwards', async () => {
  const options = {
    endTimestamp: new Date(end.getTime() + QUARTER_HOUR),
    fixtures: fixture.dataset.fixtures,
  };
  const results = await Promise.all([
    extendReadings(fixture.db, options),
    extendReadings(fixture.db, options),
  ]);
  expect(results.reduce((sum, row) => sum + row.rowsAdded, 0)).toBe(
    fixture.dataset.installations.length - 2,
  );
  const bad = await fixture.db
    .$queryRaw`SELECT count(*)::int AS count FROM (SELECT cumulative_energy_kwh, LAG(cumulative_energy_kwh) OVER (PARTITION BY meter_id ORDER BY timestamp) AS previous FROM generation_readings) r WHERE cumulative_energy_kwh < previous`;
  expect(bad[0].count).toBe(0);
});

test('extension preserves a device timestamp cadence instead of snapping it backwards', async () => {
  const site = fixture.dataset.installations.find(
    (row) => row.name === 'Colombo Rooftop Solar 3',
  );
  const previous = await fixture.db.generationReading.findFirst({
    where: { meter_id: site.meter_id },
    orderBy: { timestamp: 'desc' },
  });
  const timestamp = new Date('2026-10-09T12:16:37.123Z');
  await fixture.db.generationReading.create({
    data: {
      meter_id: site.meter_id,
      timestamp,
      power_Kw: 0,
      cumulative_energy_Kwh: previous.cumulative_energy_Kwh + 1,
      voltage: 230,
    },
  });
  const options = {
    endTimestamp: new Date('2026-10-09T12:45:00Z'),
    fixtures: fixture.dataset.fixtures,
  };
  await extendReadings(fixture.db, options);
  const added = await fixture.db.generationReading.findMany({
    where: { meter_id: site.meter_id, timestamp: { gt: timestamp } },
    orderBy: { timestamp: 'asc' },
    take: 100,
  });
  expect(added).toHaveLength(1);
  expect(added[0].timestamp.getTime()).toBe(timestamp.getTime() + QUARTER_HOUR);
  expect(added[0].cumulative_energy_Kwh).toBeGreaterThanOrEqual(
    previous.cumulative_energy_Kwh + 1,
  );
  expect((await extendReadings(fixture.db, options)).rowsAdded).toBe(0);
});
