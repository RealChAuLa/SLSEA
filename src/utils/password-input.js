import { z } from 'zod';
import { ApiError } from '../errors/api-error.js';
const newPassword = z
  .string()
  .refine(
    (value) => [...value].length >= 10,
    'must contain at least 10 characters',
  )
  .regex(/\p{L}/u, 'must contain a letter')
  .regex(/\p{Nd}/u, 'must contain a digit')
  .refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'must not exceed 72 UTF-8 bytes',
  );
const currentPassword = z
  .string()
  .min(1)
  .refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'must not exceed 72 UTF-8 bytes',
  );

export function parsePasswordChange(body, self) {
  const schema = z
    .object(
      self
        ? { current_password: currentPassword, new_password: newPassword }
        : { new_password: newPassword },
    )
    .strict();
  const result = schema.safeParse(body);
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
