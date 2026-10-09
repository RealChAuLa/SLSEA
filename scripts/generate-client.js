import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
// Build-time generation/compilation only; neither command opens a DB connection.
for (const [entry, args] of [
  ['../node_modules/prisma/build/index.js', ['generate']],
  ['../node_modules/typescript/bin/tsc', ['--project', 'tsconfig.prisma.json']],
]) {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL(entry, import.meta.url)), ...args],
    { cwd: root, stdio: 'inherit', windowsHide: true },
  );
  if (result.error || result.status !== 0) {
    process.exitCode = result.status || 1;
    break;
  }
}
