import { parseReadingInput } from '../../src/utils/reading-input.js';
import { loadIngestionConfig } from '../../src/config/data.js';
import { parseSimulationArgs } from '../../scripts/simulate.js';
const clockTime = new Date('2026-10-09T12:00:00Z');
const input = {
  timestamp: clockTime.toISOString(),
  power_Kw: 1,
  cumulative_energy_Kwh: 10,
  voltage: 230,
};
test('reading input normalizes offsets and accepts the exact time and value bounds', () => {
  const result = parseReadingInput(
    { ...input, timestamp: '2026-10-09T17:30:00+05:30' },
    clockTime,
    50,
  );
  expect(result.timestamp.toISOString()).toBe(clockTime.toISOString());
  for (const delta of [-30 * 86400000, 5 * 60000])
    expect(() =>
      parseReadingInput(
        {
          ...input,
          timestamp: new Date(clockTime.getTime() + delta).toISOString(),
          power_Kw: 50,
          voltage: 150,
        },
        clockTime,
        50,
      ),
    ).not.toThrow();
});
test.each([
  { timestamp: '2026-10-09T12:00:00' },
  { timestamp: 'not-a-date' },
  { timestamp: new Date(clockTime.getTime() + 300001).toISOString() },
  {
    timestamp: new Date(clockTime.getTime() - 30 * 86400000 - 1).toISOString(),
  },
  { power_Kw: -1 },
  { power_Kw: 50.001 },
  { power_Kw: '1' },
  { cumulative_energy_Kwh: -1 },
  { voltage: 149.9 },
  { voltage: 300.1 },
  { site_id: 1 },
  { meter_id: 'MTR-0001' },
  { extra: true },
])('reading input rejects invalid fields: %j', (patch) => {
  expect(() =>
    parseReadingInput({ ...input, ...patch }, clockTime, 50),
  ).toThrow();
});
test('ingestion config and simulator arguments validate defaults and reject ambiguous options', () => {
  expect(loadIngestionConfig({})).toEqual({ maxPowerKw: 50 });
  expect(() => loadIngestionConfig({ MAX_POWER_KW: '0' })).toThrow();
  expect(
    parseSimulationArgs([
      '--site',
      '1',
      '--count',
      '2',
      '--base-url',
      'http://localhost:3000',
    ]),
  ).toEqual({
    siteId: 1,
    all: false,
    count: 2,
    baseUrl: 'http://localhost:3000/',
  });
  for (const args of [
    [],
    ['--site', '0'],
    ['--all', '--site', '1'],
    ['--all', '--count', '0'],
    ['--all', '--unknown'],
    ['--all', '--base-url', 'https://user:password@example.test'],
  ])
    expect(() => parseSimulationArgs(args)).toThrow();
});
