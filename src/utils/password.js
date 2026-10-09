import bcrypt from 'bcryptjs';
import { ApiError } from '../errors/api-error.js';

const bcryptCost = 12;

export async function hashPassword(password) {
  if (
    typeof password !== 'string' ||
    !password.length ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    throw new ApiError('VALIDATION_FAILED', 400, 'Request validation failed.', [
      { field: 'password', issue: 'must contain between 1 and 72 UTF-8 bytes' },
    ]);
  }
  return bcrypt.hash(password, bcryptCost);
}

export async function comparePassword(password, hash) {
  if (
    typeof password !== 'string' ||
    typeof hash !== 'string' ||
    Buffer.byteLength(password, 'utf8') > 72
  )
    return false;
  return bcrypt.compare(password, hash);
}
