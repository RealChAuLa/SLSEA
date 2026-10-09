import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const origin = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
  } catch {
    return false;
  }
}, 'must be an exact HTTP(S) origin without credentials, a path or wildcard');

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) => [
      ...new Set(
        value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ])
    .pipe(z.array(origin)),
});

export function loadConfig(env = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const fields = [
      ...new Set(parsed.error.issues.map((issue) => issue.path[0])),
    ];
    // Only names of invalid variables are shown, never their submitted values.
    throw new Error(`Invalid environment configuration: ${fields.join(', ')}.`);
  }
  return Object.freeze({
    nodeEnv: parsed.data.NODE_ENV,
    port: parsed.data.PORT,
    corsOrigins: Object.freeze(parsed.data.CORS_ORIGINS),
  });
}

export const config = loadConfig();
