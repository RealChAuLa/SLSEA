import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { createDatabaseClient } from '../src/database-client.js';
import { loadSimulationConfig } from '../src/config/data.js';
import { now } from '../src/utils/clock.js';
import { isMainModule, runCli, CliUsageError } from '../src/utils/cli.js';
import {
  generateSeries,
  floorQuarterHour,
  QUARTER_HOUR,
} from '../prisma/seed-lib/generator.js';

function positive(value, label, max = 2147483647) {
  if (!/^[1-9]\d*$/.test(value ?? '') || Number(value) > max)
    throw new CliUsageError(
      `${label} must be a positive integer no greater than ${max}.`,
    );
  return Number(value);
}
function apiUrl(value) {
  try {
    const url = new URL(value);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      throw Error();
    return url.href;
  } catch {
    throw new CliUsageError(
      'API base URL must be an HTTP(S) origin without credentials.',
    );
  }
}
export function parseSimulationArgs(
  args,
  defaultBaseUrl = 'http://localhost:3000',
) {
  const result = { all: false, count: 1, baseUrl: apiUrl(defaultBaseUrl) };
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const option = args[index];
    if (seen.has(option))
      throw new CliUsageError('Duplicate simulator option.');
    seen.add(option);
    if (option === '--all') result.all = true;
    else if (option === '--site')
      result.siteId = positive(args[++index], '--site');
    else if (option === '--count')
      result.count = positive(args[++index], '--count', 5000);
    else if (option === '--base-url') result.baseUrl = apiUrl(args[++index]);
    else
      throw new CliUsageError(
        'Use simulate --site <id> or --all, with optional --count and --base-url.',
      );
  }
  if (result.all === (result.siteId !== undefined))
    throw new CliUsageError('Choose exactly one of --site or --all.');
  return result;
}
const tokenSchema = z.object({
  tokens: z
    .array(
      z.object({
        site_id: z.number().int().positive(),
        meter_id: z.string().min(1),
        token: z.string().min(1),
      }),
    )
    .min(1),
});
export async function simulateReadings({
  db,
  tokenFile,
  siteId,
  all = false,
  count = 1,
  baseUrl,
  seedRandom = 20260601,
  clock = now,
  fetchImpl = fetch,
  output = console.info,
}) {
  const credentials = tokenSchema
    .parse(tokenFile)
    .tokens.filter((row) => all || row.site_id === siteId);
  if (!credentials.length)
    throw new CliUsageError('No device credential exists for that site.');
  const result = { created: 0, failed: 0, skipped: 0 };
  const clockTime = clock();
  for (const credential of credentials) {
    const site = await db.solarInstallation.findUnique({
      where: { site_id: credential.site_id },
      select: { meter_id: true },
    });
    if (!site || site.meter_id !== credential.meter_id)
      throw new CliUsageError(
        'Device credentials do not match the database; regenerate them.',
      );
    const latest = await db.generationReading.findFirst({
      where: { meter_id: site.meter_id },
      orderBy: { timestamp: 'desc' },
    });
    const next = latest
      ? new Date(latest.timestamp.getTime() + QUARTER_HOUR)
      : floorQuarterHour(clockTime);
    const available = Math.max(
      0,
      Math.floor(
        (clockTime.getTime() + 300000 - next.getTime()) / QUARTER_HOUR,
      ) + 1,
    );
    const due = Math.min(count, available);
    if (!due) {
      result.skipped++;
      output(
        JSON.stringify({ site_id: credential.site_id, status: 'up_to_date' }),
      );
      continue;
    }
    const series = generateSeries({
      site_id: credential.site_id,
      meter_id: site.meter_id,
      endTimestamp: new Date(next.getTime() + (due - 1) * QUARTER_HOUR),
      count: due,
      startEnergy: latest?.cumulative_energy_Kwh,
      seedRandom,
    });
    for (const row of series) {
      const response = await fetchImpl(
        new URL(
          `/v1/installations/${credential.site_id}/readings`,
          apiUrl(baseUrl),
        ),
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(30000),
          headers: {
            Authorization: `Bearer ${credential.token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            timestamp: row.timestamp.toISOString(),
            power_Kw: row.power_Kw,
            cumulative_energy_Kwh: row.cumulative_energy_Kwh,
            voltage: row.voltage,
          }),
        },
      );
      const location = response.headers.get('location');
      await response.arrayBuffer();
      output(
        JSON.stringify({
          site_id: credential.site_id,
          status: response.status,
          ...(location ? { location } : {}),
        }),
      );
      if (response.status !== 201) {
        result.failed++;
        break;
      }
      result.created++;
    }
  }
  return result;
}
export async function runSimulation(args = process.argv.slice(2)) {
  const settings = loadSimulationConfig();
  const options = parseSimulationArgs(args, settings.apiBaseUrl);
  const tokenFile = JSON.parse(
    await readFile(
      new URL('../seed-output/device-tokens.json', import.meta.url),
      'utf8',
    ),
  );
  const db = createDatabaseClient(settings.directUrl);
  try {
    const result = await simulateReadings({
      ...options,
      db,
      tokenFile,
      seedRandom: settings.seedRandom,
    });
    console.info(JSON.stringify(result));
    if (result.failed)
      throw new CliUsageError('One or more simulated readings were rejected.');
  } finally {
    await db.$disconnect();
  }
}
if (isMainModule(import.meta.url))
  await runCli('simulate', () => runSimulation());
