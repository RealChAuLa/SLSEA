const fields = {
  user: ['user_id', 'name', 'email', 'jurisdiction_type', 'jurisdiction_id'],
  province: ['province_id', 'name'],
  district: ['district_id', 'name', 'province_id'],
  substation: ['substation_id', 'name', 'district_id'],
  installation: [
    'site_id',
    'name',
    'meter_id',
    'latitude',
    'longitude',
    'substation_id',
  ],
};
export function serialize(resource, row) {
  return Object.fromEntries(
    fields[resource].map((field) => [field, row[field]]),
  );
}
