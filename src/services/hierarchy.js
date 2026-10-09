import { ApiError } from '../errors/api-error.js';

export function parseId(value) {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value) ||
    Number(value) > 2147483647
  ) {
    throw new ApiError(
      'VALIDATION_FAILED',
      400,
      'Path identifier must be a positive integer.',
    );
  }
  return Number(value);
}

export async function resolveHierarchy(db, level, id) {
  // One fixed, parameterized join per lookup, regardless of hierarchy depth.
  let rows;
  if (level === 'province') {
    rows =
      await db.$queryRaw`SELECT province_id, name FROM provinces WHERE province_id = ${id}::int`;
  } else if (level === 'district') {
    rows =
      await db.$queryRaw`SELECT district_id, name, province_id FROM districts WHERE district_id = ${id}::int`;
  } else if (level === 'substation') {
    rows =
      await db.$queryRaw`SELECT g.substation_id, g.name, g.district_id, d.province_id FROM grid_substations g JOIN districts d ON d.district_id = g.district_id WHERE g.substation_id = ${id}::int`;
  } else if (level === 'installation') {
    rows =
      await db.$queryRaw`SELECT i.site_id, i.name, i.meter_id, i.latitude, i.longitude, i.substation_id, g.district_id, d.province_id FROM solar_installations i JOIN grid_substations g ON g.substation_id = i.substation_id JOIN districts d ON d.district_id = g.district_id WHERE i.site_id = ${id}::int`;
  } else {
    throw new Error('Unknown hierarchy level.');
  }
  const row = rows[0];
  if (!row)
    throw new ApiError(
      'NOT_FOUND',
      404,
      'The requested resource was not found.',
    );
  return {
    row,
    province_id: row.province_id,
    district_id: row.district_id ?? null,
    substation_id: row.substation_id ?? null,
    site_id: row.site_id ?? null,
  };
}
