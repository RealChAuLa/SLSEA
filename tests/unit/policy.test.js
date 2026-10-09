import { canRead } from '../../src/policy/canRead.js';

const chains = {
  province: { province_id: 1, district_id: null },
  district: { province_id: 1, district_id: 1 },
  substation: { province_id: 1, district_id: 1, substation_id: 1 },
  installation: {
    province_id: 1,
    district_id: 1,
    substation_id: 1,
    site_id: 1,
  },
};
const callers = [
  [
    'national',
    { kind: 'user', jurisdiction_type: 'national', jurisdiction_id: null },
  ],
  [
    'provincial',
    { kind: 'user', jurisdiction_type: 'provincial', jurisdiction_id: 1 },
  ],
  [
    'district',
    {
      kind: 'user',
      jurisdiction_type: 'district',
      jurisdiction_id: 1,
      parent_province_id: 1,
    },
  ],
];
for (const [role, caller] of callers) {
  for (const [level, own] of Object.entries(chains)) {
    test(`${role} policy for own, sibling and foreign ${level}`, () => {
      expect(canRead(caller, own)).toBe(true);
      const sibling = { ...own, district_id: level === 'province' ? null : 2 };
      expect(canRead(caller, sibling)).toBe(
        role !== 'district' || level === 'province',
      );
      const foreign = {
        ...own,
        province_id: 2,
        district_id: level === 'province' ? null : 4,
      };
      expect(canRead(caller, foreign)).toBe(role === 'national');
    });
  }
}
test('device, malformed principal and missing target fail closed', () => {
  expect(canRead({ kind: 'device' }, chains.installation)).toBe(false);
  expect(
    canRead({ kind: 'user', jurisdiction_type: 'unknown' }, chains.province),
  ).toBe(false);
  expect(canRead(callers[0][1], null)).toBe(false);
  expect(canRead(callers[0][1], {})).toBe(false);
  expect(canRead(callers[2][1], { province_id: 1, site_id: 1 })).toBe(false);
  expect(
    canRead(
      { ...callers[2][1], parent_province_id: undefined },
      chains.province,
    ),
  ).toBe(false);
});
