import { parseSmokeArgs } from '../../scripts/smoke.js';
import { loadSmokeConfig } from '../../src/config/data.js';

test('smoke CLI accepts only a safe origin and keeps configuration secrets out of diagnostics', () => {
  expect(parseSmokeArgs([])).toEqual({ baseUrl: 'http://localhost:3000/' });
  expect(parseSmokeArgs(['--base-url', 'https://api.example.test'])).toEqual({
    baseUrl: 'https://api.example.test/',
  });
  for (const args of [
    ['--all'],
    ['--base-url'],
    ['--base-url', 'https://user:private@api.example.test'],
    ['--base-url', 'https://api.example.test/path'],
    ['--base-url', 'https://api.example.test?token=private'],
  ]) {
    expect(() => parseSmokeArgs(args)).toThrow();
    try {
      parseSmokeArgs(args);
    } catch (error) {
      expect(error.message).not.toContain('private');
    }
  }
  expect(loadSmokeConfig({})).toEqual({
    demoPassword: 'Solar#Demo2026',
    apiBaseUrl: 'http://localhost:3000',
  });
});
