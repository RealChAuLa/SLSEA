import { snapTrendWindow, enumerateBuckets } from '../../src/utils/time.js';
import { parseTrendQuery } from '../../src/utils/trend-query.js';
test('local hour/day windows snap and enumerate boundaries in UTC', () => {
  const hours = snapTrendWindow(
    new Date('2026-10-09T00:31:00Z'),
    new Date('2026-10-09T02:30:00Z'),
    'hour',
  );
  expect(hours.from.toISOString()).toBe('2026-10-09T00:30:00.000Z');
  expect(hours.to.toISOString()).toBe('2026-10-09T02:30:00.000Z');
  expect(enumerateBuckets(hours.from, hours.to, 'hour')).toHaveLength(2);
  const days = snapTrendWindow(
    new Date('2026-10-09T18:29:00Z'),
    new Date('2026-10-09T18:31:00Z'),
    'day',
  );
  expect(days.from.toISOString()).toBe('2026-10-08T18:30:00.000Z');
  expect(days.to.toISOString()).toBe('2026-10-10T18:30:00.000Z');
  expect(enumerateBuckets(days.from, days.to, 'day')).toHaveLength(2);
});
test('window caps apply after snapping, with exact maximum spans allowed', () => {
  const from = '2026-01-01T18:30:00Z';
  expect(
    parseTrendQuery({ from, to: '2026-01-08T18:30:00Z', interval: 'hour' })
      .buckets,
  ).toHaveLength(168);
  expect(
    parseTrendQuery({ from, to: '2026-04-03T18:30:00Z' }).buckets,
  ).toHaveLength(92);
  expect(() =>
    parseTrendQuery({ from, to: '2026-01-08T18:30:00.001Z', interval: 'hour' }),
  ).toThrow();
  expect(() =>
    parseTrendQuery({ from, to: '2026-04-03T18:30:00.001Z' }),
  ).toThrow();
});
test('strict trend queries reject missing, duplicated, unordered and unknown values', () => {
  const valid = { from: '2026-10-08T18:30:00Z', to: '2026-10-09T18:30:00Z' };
  for (const patch of [
    { from: undefined },
    { to: undefined },
    { from: valid.to },
    { from: 'bad' },
    { from: [valid.from, valid.from] },
    { interval: 'week' },
    { interval: ['day'] },
    { sort: 'name' },
    { extra: '1' },
    { page: '0' },
    { page_size: '501' },
  ])
    expect(() => parseTrendQuery({ ...valid, ...patch })).toThrow();
});
