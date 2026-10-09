import { ApiError } from '../errors/api-error.js';

export function scopeFilter(principal) {
  if (principal?.kind !== 'user')
    throw new ApiError('FORBIDDEN_SCOPE', 403, 'A user token is required.');
  switch (principal.jurisdiction_type) {
    case 'national':
      return { type: 'national', id: null };
    case 'provincial':
      return { type: 'province', id: principal.jurisdiction_id };
    case 'district':
      return { type: 'district', id: principal.jurisdiction_id };
    default:
      throw new ApiError(
        'FORBIDDEN_JURISDICTION',
        403,
        'The requested resource is outside your jurisdiction.',
      );
  }
}
