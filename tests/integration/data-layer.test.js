import { createTestDatabase } from '../helpers/db.js';
import { selfCheckReferenceData } from '../../prisma/seed-lib/self-check.js';

let fixture;
beforeAll(async () => {
  fixture = await createTestDatabase();
}, 60000);
afterAll(async () => {
  await fixture?.db.$disconnect();
});

test('test reference seed loads and part-one self-check verifies hierarchy and device tokens', async () => {
  const summary = await selfCheckReferenceData(
    fixture.db,
    fixture.dataset,
    fixture.tokenFile,
    fixture.tokens,
  );
  expect(summary.counts).toEqual({
    provinces: 2,
    districts: 6,
    substations: 10,
    installations: 36,
    users: 7,
    readings: 0,
  });
  const offline = await fixture.db.solarInstallation.findUnique({
    where: { site_id: fixture.dataset.fixtures.offlineSiteId },
  });
  expect(offline.name).toBe('Nuwara Eliya Rooftop Solar 5');
});

test('database rejects invalid national/district jurisdictions', async () => {
  const national = fixture.dataset.users.find(
    (user) => user.name === 'National Operator',
  );
  const district = fixture.dataset.users.find(
    (user) => user.name === 'Colombo District Officer',
  );
  await expect(
    fixture.db.user.update({
      where: { user_id: national.user_id },
      data: { jurisdiction_id: 1 },
    }),
  ).rejects.toThrow();
  await expect(
    fixture.db.user.update({
      where: { user_id: district.user_id },
      data: { jurisdiction_id: null },
    }),
  ).rejects.toThrow();
});

test('reference self-check rejects missing and tampered device credentials', async () => {
  const missing = {
    ...fixture.tokenFile,
    tokens: fixture.tokenFile.tokens.slice(1),
  };
  await expect(
    selfCheckReferenceData(
      fixture.db,
      fixture.dataset,
      missing,
      fixture.tokens,
    ),
  ).rejects.toThrow();
  const tampered = structuredClone(fixture.tokenFile);
  tampered.tokens[0].token = 'not-a-jwt';
  await expect(
    selfCheckReferenceData(
      fixture.db,
      fixture.dataset,
      tampered,
      fixture.tokens,
    ),
  ).rejects.toThrow(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
});

test('reading constraints and composite primary key reject invalid values and duplicates', async () => {
  const site = fixture.dataset.installations.find(
    (row) => row.name === 'Colombo Rooftop Solar 1',
  );
  const reading = {
    meter_id: site.meter_id,
    timestamp: new Date('2026-10-09T00:00:00.000Z'),
    power_Kw: 1,
    cumulative_energy_Kwh: 500,
    voltage: 230,
  };
  for (const invalid of [
    { power_Kw: -1 },
    { cumulative_energy_Kwh: -1 },
    { voltage: 0 },
  ]) {
    await expect(
      fixture.db.generationReading.create({ data: { ...reading, ...invalid } }),
    ).rejects.toThrow();
  }
  await fixture.db.generationReading.create({ data: reading });
  try {
    await expect(
      fixture.db.generationReading.create({ data: reading }),
    ).rejects.toThrow(expect.objectContaining({ code: 'P2002' }));
  } finally {
    await fixture.db.generationReading.delete({
      where: {
        meter_id_timestamp: {
          meter_id: reading.meter_id,
          timestamp: reading.timestamp,
        },
      },
    });
  }
});

test('explicit seed IDs advance all reference sequences to prevent future primary-key collisions', async () => {
  await fixture.db.$transaction(async (tx) => {
    const province = await tx.province.create({
      data: { name: 'Sequence fixture province' },
    });
    const district = await tx.district.create({
      data: {
        name: 'Sequence fixture district',
        province_id: province.province_id,
      },
    });
    const substation = await tx.gridSubstation.create({
      data: {
        name: 'Sequence fixture substation',
        district_id: district.district_id,
      },
    });
    const installation = await tx.solarInstallation.create({
      data: {
        name: 'Sequence fixture installation',
        meter_id: 'SEQUENCE-ONLY',
        latitude: 7,
        longitude: 80,
        substation_id: substation.substation_id,
      },
    });
    const user = await tx.user.create({
      data: {
        name: 'Sequence fixture user',
        email: 'sequence.fixture@example.test',
        password_hash: 'unusable-test-fixture',
        jurisdiction_type: 'national',
        jurisdiction_id: null,
      },
    });
    expect([
      province.province_id,
      district.district_id,
      substation.substation_id,
      installation.site_id,
      user.user_id,
    ]).toEqual([3, 7, 11, 37, 8]);
    await tx.user.delete({ where: { user_id: user.user_id } });
    await tx.solarInstallation.delete({
      where: { site_id: installation.site_id },
    });
    await tx.gridSubstation.delete({
      where: { substation_id: substation.substation_id },
    });
    await tx.district.delete({ where: { district_id: district.district_id } });
    await tx.province.delete({ where: { province_id: province.province_id } });
  });
});
