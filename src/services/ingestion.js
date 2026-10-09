import { loadIngestionConfig } from '../config/data.js';
import { parseId } from './hierarchy.js';
import { now } from '../utils/clock.js';
import { parseReadingInput } from '../utils/reading-input.js';
import { serializeReading } from '../serializers/readings.js';
import { ApiError } from '../errors/api-error.js';
import { invalidQuery } from '../utils/pagination.js';

const duplicate = () =>
  new ApiError('DUPLICATE_READING', 409, 'The reading already exists.');
const forbidden = () =>
  new ApiError(
    'FORBIDDEN_INSTALLATION',
    403,
    'The device cannot write to this installation.',
  );
export async function ingestReading(
  db,
  req,
  { clock = now, maxPowerKw = loadIngestionConfig().maxPowerKw } = {},
) {
  const siteId = parseId(req.params.siteId);
  if (req.principal.site_id !== siteId) throw forbidden();
  if (Object.keys(req.query).length)
    throw invalidQuery('query', 'contains an unsupported parameter');
  try {
    return await db.$transaction(
      async (tx) => {
        // Serialize same-installation writers, including the nearest-earlier check.
        // NO KEY UPDATE permits the reading insert's foreign-key key-share lock.
        const [site] =
          await tx.$queryRaw`SELECT site_id, meter_id FROM solar_installations WHERE site_id = ${siteId}::int FOR NO KEY UPDATE`;
        if (!site)
          throw new ApiError(
            'NOT_FOUND',
            404,
            'The installation was not found.',
          );
        if (site.meter_id !== req.principal.meter_id) throw forbidden();
        const input = parseReadingInput(req.body, clock(), maxPowerKw);
        const where = {
          meter_id_timestamp: {
            meter_id: site.meter_id,
            timestamp: input.timestamp,
          },
        };
        if (await tx.generationReading.findUnique({ where })) throw duplicate();
        const earlier = await tx.generationReading.findFirst({
          where: {
            meter_id: site.meter_id,
            timestamp: { lt: input.timestamp },
          },
          orderBy: { timestamp: 'desc' },
          select: { cumulative_energy_Kwh: true },
        });
        if (
          earlier &&
          input.cumulative_energy_Kwh < earlier.cumulative_energy_Kwh
        )
          throw new ApiError(
            'VALIDATION_FAILED',
            400,
            'Request validation failed.',
            [
              {
                field: 'cumulative_energy_Kwh',
                issue: 'must not be below the nearest earlier reading',
              },
            ],
          );
        const created = await tx.generationReading.create({
          data: { meter_id: site.meter_id, ...input },
        });
        return serializeReading(created, siteId);
      },
      { isolationLevel: 'ReadCommitted', timeout: 15000, maxWait: 10000 },
    );
  } catch (error) {
    if (error.code === 'P2002') throw duplicate();
    throw error;
  }
}
