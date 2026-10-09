import {
  loadDatabaseConfig,
  loadMigrationConfig,
  loadSeedConfig,
  loadTestDatabaseConfig,
  loadTokenConfig,
} from '../../src/config/data.js';

const runtimeUrl =
  'postgresql://fixture:fixture@ep-fixture-pooler.example.test/slsea';
const directUrl = 'postgresql://fixture:fixture@ep-fixture.example.test/slsea';

test('runtime and owner tools select pooled and direct URLs independently', () => {
  expect(loadDatabaseConfig({ DATABASE_URL: runtimeUrl }).databaseUrl).toBe(
    runtimeUrl,
  );
  expect(loadMigrationConfig({ DIRECT_URL: directUrl }).directUrl).toBe(
    directUrl,
  );
  expect(
    loadMigrationConfig({}, { required: false }).directUrl,
  ).toBeUndefined();
  expect(() => loadMigrationConfig({ DIRECT_URL: runtimeUrl })).toThrow(
    /DIRECT_URL/,
  );
  expect(() => loadMigrationConfig({ DATABASE_URL: runtimeUrl })).toThrow(
    /DIRECT_URL/,
  );
});

test('tests require their own URL and cannot connect to either form of the application database', () => {
  expect(() => loadTestDatabaseConfig({})).toThrow(/TEST_DATABASE_URL/);
  expect(() =>
    loadTestDatabaseConfig({
      DATABASE_URL: runtimeUrl,
      TEST_DATABASE_URL: directUrl,
    }),
  ).toThrow(/separate/);
  expect(() =>
    loadTestDatabaseConfig({
      DIRECT_URL: directUrl,
      TEST_DATABASE_URL: runtimeUrl,
    }),
  ).toThrow(/separate/);
  expect(() =>
    loadTestDatabaseConfig({
      DATABASE_URL: 'postgresql://fixture@localhost/slsea',
      TEST_DATABASE_URL: 'postgresql://other@127.0.0.1/slsea?schema=test',
    }),
  ).toThrow(/separate/);
  expect(
    loadTestDatabaseConfig({
      DATABASE_URL: runtimeUrl,
      TEST_DATABASE_URL:
        'postgresql://fixture:fixture@ep-test.example.test/slsea_test',
    }).testDatabaseUrl,
  ).toContain('ep-test');
});

test('token and seed settings enforce valid secrets, lifetimes, and config without exposing input', () => {
  const tokenConfig = loadTokenConfig({
    JWT_SECRET: 'test-only-config-secret-of-at-least-32-bytes',
  });
  expect(tokenConfig.userTokenTtlSeconds).toBe(3600);
  expect(tokenConfig.deviceTokenTtlDays).toBe(365);
  expect(() => loadTokenConfig({ JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  expect(() =>
    loadTokenConfig({
      JWT_SECRET: 'test-only-config-secret-of-at-least-32-bytes',
      USER_TOKEN_TTL_SECONDS: '0',
    }),
  ).toThrow();
  const seed = loadSeedConfig({
    DIRECT_URL: directUrl,
    JWT_SECRET: 'test-only-config-secret-of-at-least-32-bytes',
    SEED_CONFIRM: 'yes',
  });
  expect(seed.seedRandom).toBe(20260601);
  expect(seed.seedConfirm).toBe(true);
  expect(() =>
    loadDatabaseConfig({
      DATABASE_URL: 'postgresql://secret-user:secret-value@',
    }),
  ).toThrow(/^Invalid environment configuration: DATABASE_URL/);
});

test('malformed direct URLs report redacted configuration errors', () => {
  for (const value of [
    'secret-invalid-input',
    'postgresql://fixture@localhost/%ZZ',
  ]) {
    expect(() => loadMigrationConfig({ DIRECT_URL: value })).toThrow(
      /^Invalid environment configuration: DIRECT_URL/,
    );
  }
});

test('shared database testing requires an explicit opt-in', () => {
  expect(
    loadTestDatabaseConfig({
      DATABASE_URL: runtimeUrl,
      TEST_DATABASE_URL: directUrl,
      TEST_ALLOW_SHARED_DATABASE: 'yes',
    }).testDatabaseUrl,
  ).toBe(directUrl);
  expect(() =>
    loadTestDatabaseConfig({
      DATABASE_URL: runtimeUrl,
      TEST_DATABASE_URL: directUrl,
      TEST_ALLOW_SHARED_DATABASE: 'true',
    }),
  ).toThrow(/TEST_ALLOW_SHARED_DATABASE/);
});
