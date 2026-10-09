import { z } from 'zod';
import './index.js';

const postgresUrl = z.string().refine((value) => {
  try {
    const url = new URL(value);
    decodeURIComponent(url.pathname);
    return (
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
      Boolean(url.hostname) &&
      url.pathname.length > 1
    );
  } catch {
    return false;
  }
});
const directUrl = postgresUrl.refine((value) => {
  try {
    return !new URL(value).hostname.includes('-pooler.');
  } catch {
    return false;
  }
}, 'must use a direct connection');
const positiveInt = z.coerce.number().int().positive().max(2147483647);
const optionalUrl = (schema) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    schema.optional(),
  );

function readConfig(schema, env) {
  const result = schema.safeParse(env);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path[0])),
    ];
    throw new Error(`Invalid environment configuration: ${fields.join(', ')}.`);
  }
  return result.data;
}

export function loadDatabaseConfig(env = process.env) {
  const values = readConfig(z.object({ DATABASE_URL: postgresUrl }), env);
  return Object.freeze({ databaseUrl: values.DATABASE_URL });
}

export function loadPaginationConfig(env = process.env) {
  const values = readConfig(
    z
      .object({
        DEFAULT_PAGE_SIZE: positiveInt.max(500).default(50),
        MAX_PAGE_SIZE: positiveInt.max(500).default(500),
      })
      .refine((values) => values.DEFAULT_PAGE_SIZE <= values.MAX_PAGE_SIZE, {
        path: ['DEFAULT_PAGE_SIZE'],
      }),
    env,
  );
  return Object.freeze({
    defaultPageSize: values.DEFAULT_PAGE_SIZE,
    maxPageSize: values.MAX_PAGE_SIZE,
  });
}

export function loadMigrationConfig(
  env = process.env,
  { required = true } = {},
) {
  const values = readConfig(
    z.object({ DIRECT_URL: required ? directUrl : optionalUrl(directUrl) }),
    env,
  );
  return Object.freeze({ directUrl: values.DIRECT_URL });
}

function databaseIdentity(value) {
  const url = new URL(value);
  let host = url.hostname.toLowerCase().replace('-pooler.', '.');
  if (['localhost', '127.0.0.1', '[::1]'].includes(host)) host = 'localhost';
  // A different role, password, or schema does not make destructive tests safe.
  return `${host}:${url.port || '5432'}${decodeURIComponent(url.pathname)}`;
}

export function loadTestDatabaseConfig(env = process.env) {
  const values = readConfig(
    z.object({
      TEST_DATABASE_URL: postgresUrl,
      DATABASE_URL: optionalUrl(postgresUrl),
      DIRECT_URL: optionalUrl(postgresUrl),
      TEST_ALLOW_SHARED_DATABASE: z.enum(['yes', 'no']).default('no'),
    }),
    env,
  );
  const testIdentity = databaseIdentity(values.TEST_DATABASE_URL);
  for (const value of [values.DATABASE_URL, values.DIRECT_URL].filter(
    Boolean,
  )) {
    if (
      databaseIdentity(value) === testIdentity &&
      values.TEST_ALLOW_SHARED_DATABASE !== 'yes'
    )
      throw new Error(
        'TEST_DATABASE_URL must identify a separate database or Neon branch.',
      );
  }
  return Object.freeze({ testDatabaseUrl: values.TEST_DATABASE_URL });
}

export function loadTokenConfig(env = process.env) {
  const values = readConfig(
    z.object({
      JWT_SECRET: z
        .string()
        .refine((value) => Buffer.byteLength(value, 'utf8') >= 32),
      JWT_ISSUER: z.string().trim().min(1).default('slsea-solar-api'),
      JWT_AUDIENCE: z.string().trim().min(1).default('slsea-solar-api'),
      USER_TOKEN_TTL_SECONDS: positiveInt.default(3600),
      DEVICE_TOKEN_TTL_DAYS: positiveInt.max(3650).default(365),
    }),
    env,
  );
  return Object.freeze({
    jwtSecret: values.JWT_SECRET,
    jwtIssuer: values.JWT_ISSUER,
    jwtAudience: values.JWT_AUDIENCE,
    userTokenTtlSeconds: values.USER_TOKEN_TTL_SECONDS,
    deviceTokenTtlDays: values.DEVICE_TOKEN_TTL_DAYS,
  });
}

export function loadSeedConfig(env = process.env) {
  const values = readConfig(
    z.object({
      SEED_DEMO_PASSWORD: z
        .string()
        .min(10)
        .refine(
          (value) =>
            /[a-z]/i.test(value) &&
            /\d/.test(value) &&
            Buffer.byteLength(value, 'utf8') <= 72,
        )
        .default('Solar#Demo2026'),
      SEED_RANDOM: z.coerce
        .number()
        .int()
        .min(0)
        .max(4294967295)
        .default(20260601),
      SEED_CONFIRM: z.enum(['yes', 'no']).default('no'),
    }),
    env,
  );
  return Object.freeze({
    ...loadMigrationConfig(env),
    ...loadTokenConfig(env),
    seedDemoPassword: values.SEED_DEMO_PASSWORD,
    seedRandom: values.SEED_RANDOM,
    seedConfirm: values.SEED_CONFIRM === 'yes',
  });
}

// Prisma loads its config even for offline generation. Runtime environment is
// read here so schema/client generation can omit a database URL entirely.
export function prismaCliEnvironment(databaseUrl) {
  return { ...process.env, DIRECT_URL: databaseUrl };
}
