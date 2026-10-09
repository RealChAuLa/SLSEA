import { Prisma } from '../generated/prisma/client.js';
import { levels } from './levels.js';
import { ApiError } from '../errors/api-error.js';
const positive = (value) => Number.isInteger(value) && value > 0;

export function canManageUser(caller, target) {
  if (
    caller?.kind !== 'user' ||
    !positive(caller.user_id) ||
    !positive(target?.user_id) ||
    caller.user_id === target.user_id ||
    !(levels[caller.jurisdiction_type] > levels[target.jurisdiction_type]) ||
    !positive(target.jurisdiction_id)
  )
    return false;
  if (caller.jurisdiction_type === 'national')
    return caller.jurisdiction_id === null;
  return (
    caller.jurisdiction_type === 'provincial' &&
    target.jurisdiction_type === 'district' &&
    positive(caller.jurisdiction_id) &&
    caller.jurisdiction_id === target.province_id
  );
}
export function requireManageUser(caller, target) {
  if (!canManageUser(caller, target))
    throw new ApiError(
      'FORBIDDEN_JURISDICTION',
      403,
      'The requested user is outside your management jurisdiction.',
    );
}
// Fixed u/d aliases; caller IDs are verified token values bound as parameters.
export function manageableUserPredicate(caller) {
  if (caller?.kind !== 'user' || !positive(caller.user_id))
    return Prisma.sql`FALSE`;
  if (
    caller.jurisdiction_type === 'national' &&
    caller.jurisdiction_id === null
  )
    return Prisma.sql`u.jurisdiction_type IN ('provincial','district')`;
  if (
    caller.jurisdiction_type === 'provincial' &&
    positive(caller.jurisdiction_id)
  )
    return Prisma.sql`u.jurisdiction_type = 'district' AND d.province_id = ${caller.jurisdiction_id}::int`;
  return Prisma.sql`FALSE`;
}
