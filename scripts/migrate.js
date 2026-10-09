import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  loadMigrationConfig,
  prismaCliEnvironment,
} from '../src/config/data.js';
import { runCli } from '../src/utils/cli.js';

await runCli('migration', async () => {
  const { directUrl } = loadMigrationConfig();
  console.info(`Migration database host: ${new URL(directUrl).hostname}`);
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL('../node_modules/prisma/build/index.js', import.meta.url),
      ),
      'migrate',
      'deploy',
    ],
    {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: prismaCliEnvironment(directUrl),
      encoding: 'utf8',
      timeout: 120000,
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      'Migration deploy failed. Raw database diagnostics are withheld.',
    );
  console.info('Prisma migration deploy completed.');
});
