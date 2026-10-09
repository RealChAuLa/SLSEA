export function canRead(principal, chain) {
  if (principal?.kind !== 'user' || !chain) return false;
  switch (principal.jurisdiction_type) {
    case 'national':
      return true;
    case 'provincial':
      return principal.jurisdiction_id === chain.province_id;
    case 'district':
      // The parent-province exception permits metadata/navigation only. A target
      // with a district ID must belong to the caller's own district.
      return chain.district_id == null
        ? Number.isInteger(principal.parent_province_id) &&
            principal.parent_province_id === chain.province_id
        : principal.jurisdiction_id === chain.district_id;
    default:
      return false;
  }
}
