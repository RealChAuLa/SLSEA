import { loadMigrationConfig, loadTokenConfig } from '../src/config/data.js';
import { createDatabaseClient } from '../src/database-client.js';
import { createTokenUtils } from '../src/utils/jwt.js';
import { isMainModule, runCli, CliUsageError } from '../src/utils/cli.js';
import {
  readInstallations,
  createDeviceTokenFile,
  writeDeviceTokenFile,
} from './seed-lib/tokens.js';

export async function regenerateDeviceTokens(args = process.argv.slice(2)) {
  if (args.length)
    throw new CliUsageError('seed:tokens does not accept options.');
  const { directUrl } = loadMigrationConfig();
  const tokens = createTokenUtils(loadTokenConfig());
  console.info(`Device token database host: ${new URL(directUrl).hostname}`);
  const db = createDatabaseClient(directUrl);
  try {
    const installations = await db.$transaction((tx) => readInstallations(tx), {
      isolationLevel: 'RepeatableRead',
      timeout: 30000,
    });
    const tokenFile = createDeviceTokenFile(installations, tokens);
    for (const entry of tokenFile.tokens) {
      const claims = tokens.verifyToken(entry.token);
      if (
        claims.site_id !== entry.site_id ||
        claims.meter_id !== entry.meter_id
      )
        throw new Error(
          'Generated device token does not match its installation.',
        );
    }
    await writeDeviceTokenFile(tokenFile);
    console.info(
      `Regenerated ${tokenFile.tokens.length} device credentials in seed-output/device-tokens.json.`,
    );
  } finally {
    await db.$disconnect();
  }
}

if (isMainModule(import.meta.url))
  await runCli('seed_tokens', () => regenerateDeviceTokens());
