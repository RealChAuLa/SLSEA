import { Prisma } from '../../src/generated/prisma/client.js';
import { buildDataset } from './dataset.js';
import { readInstallations } from './tokens.js';
import { generateSeries, floorQuarterHour, QUARTER_HOUR } from './generator.js';
import { now } from '../../src/utils/clock.js';

export async function extendReadings(
  db,
  {
    endTimestamp = now(),
    fixtures = buildDataset({ scale: 'full' }).fixtures,
    seedRandom = 20260601,
  } = {},
) {
  const end = floorQuarterHour(endTimestamp);
  const sites = (await readInstallations(db)).filter(
    (row) =>
      ![fixtures.offlineSiteId, fixtures.emptySiteId].includes(row.site_id),
  );
  if (!sites.length) return { rowsAdded: 0, end: end.toISOString() };
  const observed = await db.$queryRaw(
    Prisma.sql`SELECT DISTINCT ON (meter_id) meter_id, timestamp FROM generation_readings WHERE meter_id IN (${Prisma.join(sites.map((row) => row.meter_id))}) ORDER BY meter_id, timestamp DESC`,
  );
  const latestTimes = new Map(
    observed.map((row) => [row.meter_id, row.timestamp]),
  );
  let rowsAdded = 0;
  for (const site of sites) {
    if (latestTimes.get(site.meter_id)?.getTime() >= end.getTime()) continue;
    rowsAdded += await db.$transaction(
      async (tx) => {
        const [locked] =
          await tx.$queryRaw`SELECT site_id, meter_id FROM solar_installations WHERE site_id = ${site.site_id}::int FOR NO KEY UPDATE`;
        if (!locked || locked.meter_id !== site.meter_id)
          throw new Error('Installation changed during extension.');
        const latest = await tx.generationReading.findFirst({
          where: { meter_id: site.meter_id },
          orderBy: { timestamp: 'desc' },
        });
        let next = latest
          ? new Date(latest.timestamp.getTime() + QUARTER_HOUR)
          : end;
        let energy = latest?.cumulative_energy_Kwh;
        let added = 0;
        while (next <= end) {
          const count = Math.min(
            5000,
            Math.floor((end.getTime() - next.getTime()) / QUARTER_HOUR) + 1,
          );
          const batchEnd = new Date(
            next.getTime() + (count - 1) * QUARTER_HOUR,
          );
          const data = generateSeries({
            site_id: site.site_id,
            meter_id: site.meter_id,
            endTimestamp: batchEnd,
            count,
            startEnergy: energy,
            seedRandom,
            alignEnd: false,
          });
          added += (await tx.generationReading.createMany({ data })).count;
          energy = data.at(-1).cumulative_energy_Kwh;
          next = new Date(batchEnd.getTime() + QUARTER_HOUR);
        }
        return added;
      },
      { isolationLevel: 'ReadCommitted', timeout: 120000, maxWait: 10000 },
    );
  }
  return { rowsAdded, end: end.toISOString() };
}
