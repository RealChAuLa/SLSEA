import { loadSeedConfig } from '../src/config/data.js';
import { createDatabaseClient } from '../src/database-client.js';
import { createTokenUtils } from '../src/utils/jwt.js';
import { isMainModule, runCli } from '../src/utils/cli.js';
import { buildDataset } from './seed-lib/dataset.js';
import { parseSeedArgs, requireSeedConfirmation } from './seed-lib/options.js';
import { seedReferenceData } from './seed-lib/reference.js';
import { writeDeviceTokenFile } from './seed-lib/tokens.js';

export { buildDataset } from './seed-lib/dataset.js';

export async function runSeed(args = process.argv.slice(2)) {
  const options = parseSeedArgs(args);
  const settings = loadSeedConfig();
  console.info(`Seed database host: ${new URL(settings.directUrl).hostname}`);
  requireSeedConfirmation(options, settings);
  const dataset = buildDataset({
    scale: options.scale,
    seedRandom: settings.seedRandom,
  });
  const tokens = createTokenUtils(settings);
  const db = createDatabaseClient(settings.directUrl);
  try {
    const { tokenFile, summary } = await seedReferenceData(db, dataset, {
      seedDemoPassword: settings.seedDemoPassword,
      tokens,
    });
    await writeDeviceTokenFile(tokenFile);
    console.info(JSON.stringify({ scale: options.scale, ...summary }));
    console.info(
      'Reference seed complete; device credentials written to seed-output/device-tokens.json. Readings are added in I4.',
    );
  } finally {
    await db.$disconnect();
  }
}

if (isMainModule(import.meta.url)) await runCli('seed', () => runSeed());
