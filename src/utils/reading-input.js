import { z } from 'zod';
import { ApiError } from '../errors/api-error.js';

export function parseReadingInput(body, clockTime, maxPowerKw) {
  const result = z
    .object({
      timestamp: z.iso
        .datetime({ offset: true })
        .transform((value) => new Date(value))
        .refine(
          (date) =>
            Number.isFinite(date.getTime()) &&
            date.getTime() <= clockTime.getTime() + 300000 &&
            date.getTime() >= clockTime.getTime() - 30 * 86400000,
          'must be within the previous 30 days and no more than 5 minutes ahead',
        ),
      power_Kw: z.number().min(0).max(maxPowerKw),
      cumulative_energy_Kwh: z.number().min(0),
      voltage: z.number().min(150).max(300),
    })
    .strict()
    .safeParse(body);
  if (!result.success)
    throw new ApiError(
      'VALIDATION_FAILED',
      400,
      'Request validation failed.',
      result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        issue: issue.message,
      })),
    );
  return result.data;
}
