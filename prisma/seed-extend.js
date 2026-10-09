import { createDatabaseClient } from '../src/database-client.js';
import { loadSeedConfig } from '../src/config/data.js';
import { isMainModule, runCli, CliUsageError } from '../src/utils/cli.js';
import { buildDataset } from './seed-lib/dataset.js';
import { extendReadings } from './seed-lib/extend.js';

export async function runSeedExtend(args = process.argv.slice(2)) {
  let scale = 'full';
  if (args.length) {
    if (
      args.length !== 2 ||
      args[0] !== '--scale' ||
      !['full', 'test'].includes(args[1])
    )
      throw new CliUsageError(
        'Use seed:extend with optional --scale full|test.',
      );
    scale = args[1];
  }
  const settings = loadSeedConfig();
  const db = createDatabaseClient(settings.directUrl);
  try {
    console.info(
      JSON.stringify(
        await extendReadings(db, {
          fixtures: buildDataset({ scale }).fixtures,
          seedRandom: settings.seedRandom,
        }),
      ),
    );
  } finally {
    await db.$disconnect();
  }
}
if (isMainModule(import.meta.url))
  await runCli('seed_extend', () => runSeedExtend());
