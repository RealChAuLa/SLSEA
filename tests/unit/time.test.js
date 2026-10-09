import {
  startOfLocalDay,
  startOfLocalHour,
  localHour,
} from '../../src/utils/time.js';
import { operationalReading } from '../../src/services/operational.js';
import { loadOperationalConfig } from '../../src/config/data.js';

test('Asia/Colombo boundaries use fixed UTC+05:30 across UTC dates', () => {
  expect(startOfLocalDay(new Date('2026-10-09T02:00:00Z')).toISOString()).toBe(
    '2026-10-08T18:30:00.000Z',
  );
  expect(startOfLocalDay(new Date('2026-10-08T18:29:59Z')).toISOString()).toBe(
    '2026-10-07T18:30:00.000Z',
  );
  expect(startOfLocalHour(new Date('2026-10-09T02:12:00Z')).toISOString()).toBe(
    '2026-10-09T01:30:00.000Z',
  );
  expect(localHour(new Date('2026-10-09T02:00:00Z'))).toBe(7.5);
  expect(() => startOfLocalDay(new Date('invalid'))).toThrow();
});

test('freshness uses the exact inclusive threshold and configurable positive minutes', () => {
  const clockTime = new Date('2026-10-09T12:00:00Z');
  const row = {
    meter_id: 'MTR-TEST',
    timestamp: new Date(clockTime.getTime() - 30 * 60000),
    power_Kw: 1,
    cumulative_energy_Kwh: 100,
    voltage: 230,
  };
  expect(operationalReading(row, clockTime, { siteId: 1 }).is_stale).toBe(
    false,
  );
  expect(
    operationalReading(
      { ...row, timestamp: new Date(row.timestamp.getTime() - 1) },
      clockTime,
      { siteId: 1 },
    ).is_stale,
  ).toBe(true);
  expect(
    operationalReading(row, clockTime, { siteId: 1, staleAfterMinutes: 10 })
      .is_stale,
  ).toBe(true);
  expect(operationalReading(null, clockTime)).toBeNull();
  expect(loadOperationalConfig({})).toEqual({ staleAfterMinutes: 30 });
  expect(() => loadOperationalConfig({ STALE_AFTER_MINUTES: '0' })).toThrow(
    /STALE_AFTER_MINUTES/,
  );
});
