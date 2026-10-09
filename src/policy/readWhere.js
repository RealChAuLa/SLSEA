import { Prisma } from '../generated/prisma/client.js';
import { scopeFilter } from './scopeFilter.js';

export function jurisdictionWhere(principal, resource) {
  const scope = scopeFilter(principal);
  if (scope.type === 'national') return {};
  if (resource === 'province')
    return {
      province_id:
        scope.type === 'province'
          ? scope.id
          : (principal.parent_province_id ?? -1),
    };
  if (resource === 'district')
    return scope.type === 'province'
      ? { province_id: scope.id }
      : { district_id: scope.id };
  if (resource === 'substation')
    return scope.type === 'province'
      ? { district: { province_id: scope.id } }
      : { district_id: scope.id };
  return {
    substation:
      scope.type === 'province'
        ? { district: { province_id: scope.id } }
        : { district_id: scope.id },
  };
}
// Fixed i/g/d aliases are shared by operational SQL; IDs are bound parameters.
export function installationPredicate(
  principal,
  { filters = {}, substationId } = {},
) {
  const scope = scopeFilter(principal);
  const predicates = [];
  if (scope.type === 'province')
    predicates.push(Prisma.sql`d.province_id = ${scope.id}::int`);
  if (scope.type === 'district')
    predicates.push(Prisma.sql`d.district_id = ${scope.id}::int`);
  if (substationId !== undefined)
    predicates.push(Prisma.sql`g.substation_id = ${substationId}::int`);
  for (const [field, id] of Object.entries(filters)) {
    if (field === 'province_id')
      predicates.push(Prisma.sql`d.province_id = ${id}::int`);
    else if (field === 'district_id')
      predicates.push(Prisma.sql`d.district_id = ${id}::int`);
    else if (field === 'substation_id')
      predicates.push(Prisma.sql`g.substation_id = ${id}::int`);
    else throw new Error('Unknown operational filter.');
  }
  return predicates.length
    ? Prisma.join(predicates, ' AND ')
    : Prisma.sql`TRUE`;
}
