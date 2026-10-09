import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'yaml';

const spec = parse(
  await readFile(new URL('../openapi.yaml', import.meta.url), 'utf8'),
  { merge: true },
);
await writeFile(
  new URL('../openapi.json', import.meta.url),
  `${JSON.stringify(spec, null, 2)}\n`,
);
console.info('Built openapi.json from openapi.yaml.');
