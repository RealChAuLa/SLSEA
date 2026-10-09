import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  loadTestDatabaseConfig,
  prismaCliEnvironment,
} from '../../src/config/data.js';
import { createDatabaseClient } from '../../src/database-client.js';
import { createTokenUtils } from '../../src/utils/jwt.js';
import { buildDataset } from '../../prisma/seed-lib/dataset.js';
import { seedReferenceData } from '../../prisma/seed-lib/reference.js';
import { seedReadings } from '../../prisma/seed-lib/history.js';

export async function createTestDatabase({
  history = false,
  endTimestamp,
} = {}) {
  // No URL fallback. Shared targets require the owner's explicit config opt-in.
  const { testDatabaseUrl } = loadTestDatabaseConfig();
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL('../../node_modules/prisma/build/index.js', import.meta.url),
      ),
      'migrate',
      'deploy',
    ],
    {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      env: prismaCliEnvironment(testDatabaseUrl),
      encoding: 'utf8',
      timeout: 60000,
      windowsHide: true,
    },
  );
  // Suppress raw CLI diagnostics, which may include input or connection data.
  if (result.error || result.status !== 0)
    throw new Error(
      'Test migrations failed. Check the isolated TEST_DATABASE_URL; database output was withheld.',
    );
  const db = createDatabaseClient(testDatabaseUrl);
  const dataset = buildDataset({ scale: 'test' });
  const tokens = createTokenUtils({
    jwtSecret: 'isolated-test-only-signing-secret-at-least-32-bytes',
    jwtIssuer: 'slsea-solar-api',
    jwtAudience: 'slsea-solar-api',
    userTokenTtlSeconds: 3600,
    deviceTokenTtlDays: 365,
  });
  try {
    const { tokenFile } = await seedReferenceData(db, dataset, {
      seedDemoPassword: 'Fixture#Password2026',
      tokens,
    });
    const historySummary = history
      ? await seedReadings(db, dataset, { scale: 'test', endTimestamp })
      : undefined;
    return { db, dataset, tokens, tokenFile, historySummary };
  } catch (error) {
    await db.$disconnect();
    throw error;
  }
}
