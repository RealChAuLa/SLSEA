import assert from 'node:assert/strict';

const userFields = {
  user_id: true,
  name: true,
  email: true,
  jurisdiction_type: true,
  jurisdiction_id: true,
};

export async function selfCheckReferenceData(db, dataset, tokenFile, tokens) {
  const [
    provinceCount,
    districtCount,
    substationCount,
    installationCount,
    userCount,
    readingCount,
  ] = await Promise.all([
    db.province.count(),
    db.district.count(),
    db.gridSubstation.count(),
    db.solarInstallation.count(),
    db.user.count(),
    db.generationReading.count(),
  ]);
  assert.deepEqual(
    [
      provinceCount,
      districtCount,
      substationCount,
      installationCount,
      userCount,
      readingCount,
    ],
    [
      dataset.provinces.length,
      dataset.districts.length,
      dataset.substations.length,
      dataset.installations.length,
      dataset.users.length,
      0,
    ],
    'Reference seed counts do not match the chosen scale.',
  );

  const [provinces, districts, substations, installations, users] =
    await Promise.all([
      db.province.findMany({
        take: provinceCount,
        orderBy: { province_id: 'asc' },
      }),
      db.district.findMany({
        take: districtCount,
        orderBy: { district_id: 'asc' },
      }),
      db.gridSubstation.findMany({
        take: substationCount,
        orderBy: { substation_id: 'asc' },
      }),
      db.solarInstallation.findMany({
        take: installationCount,
        orderBy: { site_id: 'asc' },
      }),
      db.user.findMany({
        take: userCount,
        orderBy: { user_id: 'asc' },
        select: userFields,
      }),
    ]);
  for (const [actual, expected] of [
    [provinces, dataset.provinces],
    [districts, dataset.districts],
    [substations, dataset.substations],
    [installations, dataset.installations],
    [users, dataset.users],
  ])
    assert.deepEqual(
      actual,
      expected,
      'Reference seed rows differ from the deterministic dataset.',
    );

  const provinceIds = new Set(provinces.map((row) => row.province_id));
  const districtIds = new Set(districts.map((row) => row.district_id));
  const substationIds = new Set(substations.map((row) => row.substation_id));
  for (const district of districts)
    assert(
      provinceIds.has(district.province_id),
      'District parent is missing.',
    );
  for (const substation of substations)
    assert(
      districtIds.has(substation.district_id),
      'Substation parent is missing.',
    );
  for (const installation of installations)
    assert(
      substationIds.has(installation.substation_id),
      'Installation parent is missing.',
    );
  for (const user of users) {
    if (user.jurisdiction_type === 'national')
      assert.equal(
        user.jurisdiction_id,
        null,
        'National jurisdiction must be null.',
      );
    else
      assert(
        (user.jurisdiction_type === 'provincial'
          ? provinceIds
          : districtIds
        ).has(user.jurisdiction_id),
        'User jurisdiction does not resolve.',
      );
  }
  assert.equal(
    tokenFile.issuer,
    tokens.issuer,
    'Token-file issuer is incorrect.',
  );
  assert.equal(
    tokenFile.audience,
    tokens.audience,
    'Token-file audience is incorrect.',
  );
  assert.equal(
    tokenFile.tokens.length,
    installations.length,
    'Device token count is incorrect.',
  );
  const byId = new Map(installations.map((site) => [site.site_id, site]));
  const seen = new Set();
  for (const entry of tokenFile.tokens) {
    const installation = byId.get(entry.site_id);
    assert(
      installation && !seen.has(entry.site_id),
      'Token installation is missing or repeated.',
    );
    const claims = tokens.verifyToken(entry.token);
    assert(
      claims.typ === 'device' &&
        claims.site_id === installation.site_id &&
        claims.meter_id === installation.meter_id &&
        entry.meter_id === installation.meter_id,
      'Device token does not match its installation.',
    );
    seen.add(entry.site_id);
  }
  return {
    counts: {
      provinces: provinceCount,
      districts: districtCount,
      substations: substationCount,
      installations: installationCount,
      users: userCount,
      readings: readingCount,
    },
    verifiedTokens: seen.size,
  };
}
