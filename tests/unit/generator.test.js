import {
  generateSeries,
  solarCurve,
  siteCapacity,
  startEnergy,
  floorQuarterHour,
} from '../../prisma/seed-lib/generator.js';

test('solar generation is deterministic, bounded, overnight-zero and cumulative-monotonic', () => {
  const end = new Date('2026-10-09T18:30:00.000Z');
  const rows = generateSeries({ site_id: 1, endTimestamp: end, count: 192 });
  expect(rows).toEqual(
    generateSeries({ site_id: 1, endTimestamp: end, count: 192 }),
  );
  expect(rows).toHaveLength(192);
  expect(rows.at(-1).timestamp).toEqual(end);
  let energy = startEnergy(1);
  for (const row of rows) {
    const local = new Date(row.timestamp.getTime() + 330 * 60000);
    const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
    expect(row.power_Kw).toBeGreaterThanOrEqual(0);
    expect(row.power_Kw).toBeLessThanOrEqual(siteCapacity(1) * 1.05 + 0.001);
    if (hour <= 6 || hour >= 18) expect(row.power_Kw).toBe(0);
    expect(row.cumulative_energy_Kwh).toBeGreaterThanOrEqual(energy);
    expect(
      Math.abs(row.cumulative_energy_Kwh - (energy + row.power_Kw * 0.25)),
    ).toBeLessThanOrEqual(0.00050001);
    expect(row.voltage).toBeGreaterThanOrEqual(215);
    expect(row.voltage).toBeLessThanOrEqual(245);
    energy = row.cumulative_energy_Kwh;
  }
  expect(rows[1].timestamp - rows[0].timestamp).toBe(900000);
  expect(rows).not.toEqual(
    generateSeries({ site_id: 2, endTimestamp: end, count: 192 }),
  );
  expect(solarCurve(12)).toBe(1);
  expect(solarCurve(0)).toBe(0);
  expect(floorQuarterHour(new Date('2026-10-09T12:19:43Z')).toISOString()).toBe(
    '2026-10-09T12:15:00.000Z',
  );
});
test('generation can continue a series in a separate chunk without changing the sequence', () => {
  const end = new Date('2026-10-09T18:00:00Z');
  const whole = generateSeries({ site_id: 7, endTimestamp: end, count: 192 });
  const first = generateSeries({
    site_id: 7,
    endTimestamp: new Date(end.getTime() - 96 * 900000),
    count: 96,
  });
  const second = generateSeries({
    site_id: 7,
    endTimestamp: end,
    count: 96,
    startEnergy: first.at(-1).cumulative_energy_Kwh,
  });
  expect([...first, ...second]).toEqual(whole);
  for (const options of [
    { site_id: 0, count: 2, endTimestamp: end },
    { site_id: 1, count: -1, endTimestamp: end },
    { site_id: 1, count: 2, endTimestamp: 'bad' },
    { site_id: 1, count: 2, endTimestamp: end, startEnergy: -1 },
  ])
    expect(() => generateSeries(options)).toThrow();
});
