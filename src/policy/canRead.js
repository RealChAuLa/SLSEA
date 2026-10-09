import { ApiError } from '../errors/api-error.js';

export function requireRead(principal, chain) {
  if (!canRead(principal, chain))
    throw new ApiError(
      'FORBIDDEN_JURISDICTION',
      403,
      'The requested resource is outside your jurisdiction.',
    );
}

export function canRead(principal, chain) {
  if (
    principal?.kind !== 'user' ||
    !Number.isInteger(chain?.province_id) ||
    chain.province_id <= 0
  )
    return false;
  switch (principal.jurisdiction_type) {
    case 'national':
      return true;
    case 'provincial':
      return (
        Number.isInteger(principal.jurisdiction_id) &&
        principal.jurisdiction_id > 0 &&
        principal.jurisdiction_id === chain.province_id
      );
    case 'district':
      // The parent-province exception permits metadata/navigation only. A target
      // with a district ID must belong to the caller's own district.
      return chain.district_id == null
        ? chain.substation_id == null &&
            chain.site_id == null &&
            Number.isInteger(principal.parent_province_id) &&
            principal.parent_province_id === chain.province_id
        : Number.isInteger(principal.jurisdiction_id) &&
            principal.jurisdiction_id > 0 &&
            principal.jurisdiction_id === chain.district_id;
    default:
      return false;
  }
}
