import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createTestDatabase } from '../helpers/db.js';
import { regionalSnapshot } from '../../src/services/regions.js';
import { startOfLocalDay } from '../../src/utils/time.js';
import { expectApiError } from '../helpers/expect-api-error.js';
jest.setTimeout(60000);
const end = new Date('2026-10-09T12:00:00Z');
let fixture, app, users, colombo, western, sites;
let queries = 0;
beforeAll(async () => {
  fixture = await createTestDatabase({ queryLogging: true });
  users = await fixture.db.user.findMany();
  colombo = fixture.dataset.districts.find((row) => row.name === 'Colombo');
  western = fixture.dataset.provinces.find((row) => row.name === 'Western');
  const stationIds = fixture.dataset.substations
    .filter((row) => row.district_id === colombo.district_id)
    .map((row) => row.substation_id);
  sites = fixture.dataset.installations.filter((row) =>
    stationIds.includes(row.substation_id),
  );
  const midnight = startOfLocalDay(end);
  const row = (site, timestamp, energy, power = 0) => ({
    meter_id: site.meter_id,
    timestamp,
    cumulative_energy_Kwh: energy,
    power_Kw: power,
    voltage: 230,
  });
  await fixture.db.generationReading.createMany({
    data: [
      row(sites[0], new Date(midnight.getTime() - 900000), 100),
      row(sites[0], end, 110, 4),
      row(sites[1], new Date(midnight.getTime() - 900000), 50),
      row(sites[1], new Date(end.getTime() - 7200000), 60, 3),
      row(sites[3], midnight, 200),
      row(sites[3], end, 208, 2),
      row(sites[4], new Date(midnight.getTime() - 3 * 86400000), 20),
      row(sites[4], end, 25, 1),
      row(sites[5], new Date(midnight.getTime() - 900000), 300),
    ],
  });
  app = createApp({
    db: fixture.db,
    tokens: fixture.tokens,
    clock: () => end,
    logger: { info() {}, error() {} },
  });
  fixture.db.$on('query', () => queries++);
});
afterAll(async () => {
  await fixture?.db.$disconnect();
});
const auth = (name = 'National Operator') =>
  `Bearer ${fixture.tokens.signUserToken(users.find((row) => row.name === name))}`;
const get = (path, name) =>
  request(app).get(path).set('Authorization', auth(name));
const expected = {
  installations_total: 6,
  installations_reporting: 3,
  installations_not_reporting: 3,
  total_power_Kw: 7,
  energy_today_Kwh: 33,
};
test('hand-computed snapshot includes stale energy and unlimited old baseline, with one SQL query', async () => {
  queries = 0;
  const snapshot = await regionalSnapshot(
    fixture.db,
    { type: 'district', id: colombo.district_id },
    end,
  );
  expect(snapshot).toEqual(expected);
  expect(queries).toBe(1);
  const res = await get(
    `/v1/districts/${colombo.district_id}/generation-summary`,
  ).expect(200);
  expect(res.body).toEqual({
    scope: { type: 'district', id: colombo.district_id, name: 'Colombo' },
    as_of: end.toISOString(),
    timezone: 'Asia/Colombo',
    ...expected,
  });
  expect(res.headers['last-modified']).toBe(end.toUTCString());
});
test('root resolves each user jurisdiction and regional totals compose across levels', async () => {
  for (const [name, type, id, title] of [
    ['National Operator', 'national', null, 'Sri Lanka'],
    ['Western Province Officer', 'province', western.province_id, 'Western'],
    ['Colombo District Officer', 'district', colombo.district_id, 'Colombo'],
  ]) {
    const res = await get('/v1/generation-summary', name).expect(200);
    expect(res.body.scope).toEqual({ type, id, name: title });
    expect(res.body.energy_today_Kwh).toBe(33);
    if (type === 'district')
      expect(res.body).toEqual(expect.objectContaining(expected));
  }
  const province = await get(
    `/v1/provinces/${western.province_id}/generation-summary`,
  ).expect(200);
  const districtResults = [];
  for (const district of fixture.dataset.districts.filter(
    (row) => row.province_id === western.province_id,
  ))
    districtResults.push(
      (
        await get(
          `/v1/districts/${district.district_id}/generation-summary`,
        ).expect(200)
      ).body,
    );
  for (const field of Object.keys(expected))
    expect(province.body[field]).toBeCloseTo(
      districtResults.reduce((sum, row) => sum + row[field], 0),
      3,
    );
  const stationResults = [];
  for (const station of fixture.dataset.substations.filter(
    (row) => row.district_id === colombo.district_id,
  ))
    stationResults.push(
      (
        await get(
          `/v1/grid-substations/${station.substation_id}/generation-summary`,
        ).expect(200)
      ).body,
    );
  for (const field of Object.keys(expected))
    expect(
      stationResults.reduce((sum, row) => sum + row[field], 0),
    ).toBeCloseTo(expected[field], 3);
});
test('installation snapshot energy equals overview for baseline, fallback, stale and empty sites', async () => {
  for (const site of sites) {
    const snapshot = await regionalSnapshot(
      fixture.db,
      { type: 'installation', id: site.site_id },
      end,
    );
    const overview = await get(
      `/v1/installations/${site.site_id}/overview`,
    ).expect(200);
    expect(snapshot.energy_today_Kwh).toBe(overview.body.today.energy_Kwh);
  }
});
test('existing zero-installation region returns all zeros', async () => {
  const province = await fixture.db.province.create({
    data: { name: 'Empty Province' },
  });
  const res = await get(
    `/v1/provinces/${province.province_id}/generation-summary`,
  ).expect(200);
  for (const field of Object.keys(expected)) expect(res.body[field]).toBe(0);
});
test('district navigation does not expose province aggregates; all summaries enforce access and strict queries', async () => {
  const gampaha = fixture.dataset.districts.find(
    (row) => row.name === 'Gampaha',
  );
  const central = fixture.dataset.provinces.find(
    (row) => row.name === 'Central',
  );
  for (const [path, caller] of [
    [
      `/v1/districts/${gampaha.district_id}/generation-summary`,
      'Colombo District Officer',
    ],
    [
      `/v1/provinces/${western.province_id}/generation-summary`,
      'Colombo District Officer',
    ],
    [
      `/v1/provinces/${central.province_id}/generation-summary`,
      'Western Province Officer',
    ],
  ])
    expectApiError(
      await get(path, caller).set('If-None-Match', '*'),
      403,
      'FORBIDDEN_JURISDICTION',
    );
  for (const path of [
    '/v1/generation-summary',
    `/v1/provinces/${western.province_id}/generation-summary`,
    `/v1/districts/${colombo.district_id}/generation-summary`,
    `/v1/grid-substations/${sites[0].substation_id}/generation-summary`,
  ]) {
    expectApiError(await get(`${path}?extra=1`), 400, 'INVALID_QUERY');
    expectApiError(
      await request(app).get(path).set('If-None-Match', '*'),
      401,
      'UNAUTHENTICATED',
    );
    expectApiError(
      await request(app)
        .get(path)
        .set(
          'Authorization',
          `Bearer ${fixture.tokens.signDeviceToken(sites[0])}`,
        ),
      403,
      'FORBIDDEN_SCOPE',
    );
    for (const method of [
      'post',
      'put',
      'patch',
      'delete',
      'head',
      'options',
    ]) {
      const res = await request(app)[method](path).type('json');
      expect(res.status).toBe(405);
      expect(res.headers.allow).toBe('GET');
    }
  }
  expectApiError(
    await get('/v1/districts/2147483647/generation-summary'),
    404,
    'NOT_FOUND',
  );
  expectApiError(
    await get('/v1/districts/0/generation-summary'),
    400,
    'VALIDATION_FAILED',
  );
});
test('summary conditions obey ETag ordering and HTTP source timestamp', async () => {
  const path = `/v1/districts/${colombo.district_id}/generation-summary`;
  const first = await get(path).expect(200);
  await get(path).set('If-None-Match', first.headers.etag).expect(304);
  await get(path)
    .set('If-Modified-Since', first.headers['last-modified'])
    .expect(304);
  await get(path)
    .set('If-None-Match', '"different"')
    .set('If-Modified-Since', first.headers['last-modified'])
    .expect(200);
  expectApiError(
    await get(path)
      .set('If-Match', '"wrong"')
      .set('If-None-Match', first.headers.etag),
    412,
    'PRECONDITION_FAILED',
  );
});
test('snapshot excludes future latest readings and uses the inclusive freshness boundary', async () => {
  const site = sites[2];
  await fixture.db.generationReading.createMany({
    data: [
      {
        meter_id: site.meter_id,
        timestamp: new Date(end.getTime() - 1800000),
        power_Kw: 5,
        cumulative_energy_Kwh: 1,
        voltage: 230,
      },
      {
        meter_id: site.meter_id,
        timestamp: new Date(end.getTime() + 60000),
        power_Kw: 9,
        cumulative_energy_Kwh: 2,
        voltage: 230,
      },
    ],
  });
  const scope = { type: 'installation', id: site.site_id };
  expect(
    (await regionalSnapshot(fixture.db, scope, end)).installations_reporting,
  ).toBe(1);
  expect(
    (await regionalSnapshot(fixture.db, scope, new Date(end.getTime() + 1)))
      .installations_reporting,
  ).toBe(0);
  expect((await regionalSnapshot(fixture.db, scope, end)).total_power_Kw).toBe(
    5,
  );
});
