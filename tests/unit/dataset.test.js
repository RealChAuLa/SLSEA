import { buildDataset } from '../../prisma/seed-lib/dataset.js';
import { districts as geography } from '../../prisma/seed-lib/geography.js';
import { mulberry32 } from '../../prisma/seed-lib/prng.js';

test('full reference geography has the blueprint counts and contiguous stable site IDs', () => {
  const data = buildDataset();
  expect([
    data.provinces.length,
    data.districts.length,
    data.substations.length,
    data.installations.length,
    data.users.length,
  ]).toEqual([9, 25, 30, 240, 7]);
  expect(data.installations.map((site) => site.site_id)).toEqual(
    Array.from({ length: 240 }, (_, index) => index + 1),
  );
  expect(data.installations[0]).toEqual(
    expect.objectContaining({
      name: 'Colombo Rooftop Solar 1',
      meter_id: 'MTR-0001',
      substation_id: 1,
    }),
  );
  expect(data.installations[31].name).toBe('Colombo Rooftop Solar 32');
  expect(data.installations[32].name).toBe('Gampaha Rooftop Solar 1');
  expect(data.installations[239]).toEqual(
    expect.objectContaining({
      name: 'Kegalle Rooftop Solar 6',
      meter_id: 'MTR-0240',
      substation_id: 30,
    }),
  );
  expect(data.fixtures).toEqual({ offlineSiteId: 239, emptySiteId: 240 });
});

test('every installation uses its own district substation and bounded deterministic coordinates', () => {
  const data = buildDataset();
  const substationById = new Map(
    data.substations.map((row) => [row.substation_id, row]),
  );
  for (const district of geography) {
    const sites = data.installations.filter(
      (row) =>
        substationById.get(row.substation_id).district_id ===
        district.district_id,
    );
    expect(sites).toHaveLength(district.installationCount);
    expect(sites[0].site_id).toBe(district.siteStart);
    expect(sites.at(-1).site_id).toBe(district.siteEnd);
    sites.forEach((site, index) => {
      expect(site.substation_id).toBe(
        district.substationStart + (index % district.substationCount),
      );
      expect(Math.abs(site.latitude - district.latitude)).toBeLessThanOrEqual(
        0.040005,
      );
      expect(Math.abs(site.longitude - district.longitude)).toBeLessThanOrEqual(
        0.040005,
      );
      expect(site.latitude).toBe(Number(site.latitude.toFixed(5)));
      expect(site.meter_id).toBe(
        `MTR-${String(site.site_id).padStart(4, '0')}`,
      );
    });
  }
});

test('test scale retains Western/Central hierarchy and all users, with compact fixture IDs', () => {
  const data = buildDataset({ scale: 'test' });
  expect(data.provinces.map((row) => row.name)).toEqual(['Western', 'Central']);
  expect(data.districts.map((row) => row.name)).toEqual([
    'Colombo',
    'Gampaha',
    'Kalutara',
    'Kandy',
    'Matale',
    'Nuwara Eliya',
  ]);
  expect(data.substations).toHaveLength(10);
  expect(data.installations).toHaveLength(36);
  expect(data.users).toEqual(buildDataset().users);
  expect(data.fixtures).toEqual({ offlineSiteId: 35, emptySiteId: 36 });
  expect(
    data.installations.find((row) => row.name === 'Kandy Rooftop Solar 1')
      .site_id,
  ).toBe(19);
  expect(data.installations.at(-1).name).toBe('Nuwara Eliya Rooftop Solar 6');
});

test('dataset and per-site PRNG are deterministic and do not share mutable state', () => {
  expect(buildDataset({ seedRandom: 42 })).toEqual(
    buildDataset({ seedRandom: 42 }),
  );
  expect(buildDataset({ seedRandom: 43 }).installations).not.toEqual(
    buildDataset({ seedRandom: 42 }).installations,
  );
  const a = mulberry32(123);
  const b = mulberry32(123);
  for (let index = 0; index < 100; index += 1) {
    const value = a();
    expect(value).toBe(b());
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  }
  const data = buildDataset();
  data.provinces[0].name = 'mutated';
  expect(buildDataset().provinces[0].name).toBe('Western');
  expect(() => buildDataset({ scale: 'typo' })).toThrow();
});
