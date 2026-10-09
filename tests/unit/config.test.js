import { loadConfig } from '../../src/config/index.js';

test('I0 runs without database credentials or JWT secrets', () => {
  expect(loadConfig({})).toEqual({
    nodeEnv: 'development',
    port: 3000,
    rateLimitEnabled: true,
    corsOrigins: [],
  });
});

test('config parses runtime values and trims/deduplicates origin lists', () => {
  expect(
    loadConfig({
      NODE_ENV: 'production',
      PORT: '8080',
      CORS_ORIGINS:
        'https://a.example.com, http://localhost:3000,https://a.example.com',
    }),
  ).toEqual({
    nodeEnv: 'production',
    port: 8080,
    rateLimitEnabled: true,
    corsOrigins: ['https://a.example.com', 'http://localhost:3000'],
  });
});

test.each([
  { NODE_ENV: 'invalid' },
  { RATE_LIMIT_ENABLED: 'yes' },
  { PORT: '' },
  { PORT: '0' },
  { PORT: '65536' },
  { PORT: '3.2' },
  { PORT: '3000abc' },
  { CORS_ORIGINS: '*' },
  { CORS_ORIGINS: 'https://a.example.com/path' },
  { CORS_ORIGINS: 'https://user:password@a.example.com' },
  { CORS_ORIGINS: 'file:///tmp' },
])('invalid config fails fast without printing submitted values: %j', (env) => {
  expect(() => loadConfig(env)).toThrow(/Invalid environment configuration:/);
  try {
    loadConfig(env);
  } catch (error) {
    expect(error.message).not.toContain('password');
    expect(error.message).not.toContain('3000abc');
  }
});
