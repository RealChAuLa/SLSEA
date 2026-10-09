import { provinces, districts } from './geography.js';
import { siteRandom } from './prng.js';

const userRows = [
  [1, 'National Operator', 'national.operator@slsea.lk', 'national', null],
  [2, 'National Analyst', 'national.analyst@slsea.lk', 'national', null],
  [3, 'Western Province Officer', 'western.province@slsea.lk', 'provincial', 1],
  [4, 'Central Province Officer', 'central.province@slsea.lk', 'provincial', 2],
  [5, 'Colombo District Officer', 'colombo.district@slsea.lk', 'district', 1],
  [6, 'Gampaha District Officer', 'gampaha.district@slsea.lk', 'district', 2],
  [7, 'Kandy District Officer', 'kandy.district@slsea.lk', 'district', 4],
];

export function buildDataset({ scale = 'full', seedRandom = 20260601 } = {}) {
  if (!['full', 'test'].includes(scale))
    throw new Error('Seed scale must be full or test.');
  if (
    !Number.isInteger(seedRandom) ||
    seedRandom < 0 ||
    seedRandom > 4294967295
  )
    throw new Error('Seed random value must be an unsigned 32-bit integer.');
  const selected =
    scale === 'test'
      ? districts.filter((row) => row.province_id <= 2)
      : districts;
  const substations = [];
  const installations = [];
  let nextTestId = 1;
  for (const district of selected) {
    for (let index = 0; index < district.substationCount; index += 1) {
      substations.push({
        substation_id: district.substationStart + index,
        name: `${district.name} Grid Substation ${index + 1}`,
        district_id: district.district_id,
      });
    }
    const count =
      scale === 'test'
        ? Math.min(district.installationCount, 6)
        : district.installationCount;
    for (let index = 0; index < count; index += 1) {
      const site_id =
        scale === 'test' ? nextTestId++ : district.siteStart + index;
      const random = siteRandom(seedRandom, site_id);
      installations.push({
        site_id,
        name: `${district.name} Rooftop Solar ${index + 1}`,
        meter_id: `MTR-${String(site_id).padStart(4, '0')}`,
        latitude: Number(
          (district.latitude + (random() * 2 - 1) * 0.04).toFixed(5),
        ),
        longitude: Number(
          (district.longitude + (random() * 2 - 1) * 0.04).toFixed(5),
        ),
        substation_id:
          district.substationStart + (index % district.substationCount),
      });
    }
  }
  const maxSiteId = installations.at(-1).site_id;
  return {
    provinces: provinces
      .filter((row) => scale === 'full' || row.province_id <= 2)
      .map((row) => ({ ...row })),
    districts: selected.map(({ district_id, name, province_id }) => ({
      district_id,
      name,
      province_id,
    })),
    substations,
    installations,
    users: userRows.map(
      ([user_id, name, email, jurisdiction_type, jurisdiction_id]) => ({
        user_id,
        name,
        email,
        jurisdiction_type,
        jurisdiction_id,
      }),
    ),
    fixtures: { offlineSiteId: maxSiteId - 1, emptySiteId: maxSiteId },
  };
}
