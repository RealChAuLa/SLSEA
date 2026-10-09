import { jest } from '@jest/globals';
import { now } from '../../src/utils/clock.js';

test('shared clock returns a Date and can be fixed by service tests', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-09T00:00:00.000Z'));
  try {
    expect(now().toISOString()).toBe('2026-10-09T00:00:00.000Z');
  } finally {
    jest.useRealTimers();
  }
});
