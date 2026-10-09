import { serialize } from '../../src/serializers/index.js';
import { serializeReading } from '../../src/serializers/readings.js';

test('serializers whitelist public fields even when source objects carry secrets and extra columns', () => {
  const sensitive = {
    password_hash: 'private-hash',
    pv: 'private-version',
    JWT_SECRET: 'private-secret',
    token: 'private-token',
    access_token: 'private-access-token',
    nested: { password: 'private-password' },
  };
  const row = {
    ...sensitive,
    user_id: 1,
    name: 'Example',
    email: 'user@example.test',
    jurisdiction_type: 'national',
    jurisdiction_id: null,
    province_id: 1,
    district_id: 1,
    substation_id: 1,
    site_id: 1,
    meter_id: 'MTR-0001',
    latitude: 6,
    longitude: 79,
    timestamp: new Date('2026-10-09T12:00:00Z'),
    power_Kw: 1,
    cumulative_energy_Kwh: 10,
    voltage: 230,
  };
  for (const resource of [
    'user',
    'province',
    'district',
    'substation',
    'installation',
  ]) {
    const body = serialize(resource, row);
    for (const field of Object.keys(sensitive))
      expect(body).not.toHaveProperty(field);
    expect(JSON.stringify(body)).not.toContain('private');
  }
  const reading = serializeReading(row, 1);
  expect(Object.keys(reading).sort()).toEqual(
    [
      'site_id',
      'meter_id',
      'timestamp',
      'power_Kw',
      'cumulative_energy_Kwh',
      'voltage',
    ].sort(),
  );
  expect(JSON.stringify(reading)).not.toContain('private');
});
