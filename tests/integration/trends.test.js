import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createTestDatabase } from '../helpers/db.js';
import { trendBuckets } from '../../src/services/trends.js';
import { expectApiError } from '../helpers/expect-api-error.js';
jest.setTimeout(60000);
const start = new Date('2026-10-08T18:30:00Z');
const end = new Date('2026-10-11T18:30:00Z');
let fixture, app, users, sites, colombo, western;
let queries = 0;
beforeAll(async () => {
  fixture = await createTestDatabase({ queryLogging: true });
  users = await fixture.db.user.findMany();
  colombo = fixture.dataset.districts.find((row) => row.name === 'Colombo');
  western = fixture.dataset.provinces.find((row) => row.name === 'Western');
  sites = fixture.dataset.installations.filter((row) =>
    row.name.startsWith('Colombo Rooftop'),
  );
  const reading = (site, minutes, energy) => ({
    meter_id: site.meter_id,
    timestamp: new Date(start.getTime() + minutes * 60000),
    cumulative_energy_Kwh: energy,
    power_Kw: 1,
    voltage: 230,
  });
  await fixture.db.generationReading.createMany({
    data: [
      reading(sites[0], -30, 100),
      reading(sites[0], 15, 105),
      reading(sites[0], 60, 108),
      reading(sites[0], 180, 102),
      reading(sites[0], 240, 106),
      reading(sites[0], 1439, 110),
      reading(sites[0], 1440, 112),
      reading(sites[1], -61, 50),
      reading(sites[1], 30, 52),
      reading(sites[1], 90, 55),
    ],
  });
  app = createApp({
    db: fixture.db,
    tokens: fixture.tokens,
    logger: { info() {}, error() {} },
  });
  fixture.db.$on('query', () => queries++);
});
afterAll(async () => {
  await fixture?.db.$disconnect();
});
const auth = (name = 'National Operator') =>
  `Bearer ${fixture.tokens.signUserToken(users.find((row) => row.name === name))}`;
const get = (path = '/v1/generation-trend', options = {}, name) =>
  request(app)
    .get(path)
    .set('Host', 'api.example.test')
    .set('Authorization', auth(name))
    .query({ from: start.toISOString(), to: end.toISOString(), ...options });
test('one SQL aggregate uses in-range predecessor, positive deltas and local midnight', async () => {
  queries = 0;
  const raw = await trendBuckets(
    fixture.db,
    { type: 'district', id: colombo.district_id },
    'day',
    start,
    end,
  );
  expect(queries).toBe(1);
  expect(raw.map((row) => row.energy_Kwh)).toEqual([19, 2]);
  const res = await get(
    `/v1/districts/${colombo.district_id}/generation-trend`,
  ).expect(200);
  expect(res.body.data).toEqual([
    {
      bucket_start: start.toISOString(),
      bucket_end: '2026-10-09T18:30:00.000Z',
      energy_Kwh: 19,
      reporting_installations: 2,
      reading_count: 7,
    },
    {
      bucket_start: '2026-10-09T18:30:00.000Z',
      bucket_end: '2026-10-10T18:30:00.000Z',
      energy_Kwh: 2,
      reporting_installations: 1,
      reading_count: 1,
    },
    {
      bucket_start: '2026-10-10T18:30:00.000Z',
      bucket_end: end.toISOString(),
      energy_Kwh: 0,
      reporting_installations: 0,
      reading_count: 0,
    },
  ]);
  expect(res.body.meta).toEqual({
    scope: { type: 'district', id: colombo.district_id, name: 'Colombo' },
    interval: 'day',
    timezone: 'Asia/Colombo',
    effective_from: start.toISOString(),
    effective_to: end.toISOString(),
  });
  expect(res.headers['last-modified']).toBeUndefined();
});
test('hour buckets start at :30 UTC, keep zero/reset counts and sum to daily energy', async () => {
  const hourly = await get('/v1/generation-trend', {
    interval: 'hour',
    page_size: '100',
  }).expect(200);
  expect(hourly.body.data).toHaveLength(72);
  expect(
    hourly.body.data.every((row) => row.bucket_start.slice(14, 19) === '30:00'),
  ).toBe(true);
  expect(hourly.body.data[0].energy_Kwh).toBe(5);
  expect(hourly.body.data[1].energy_Kwh).toBe(6);
  expect(hourly.body.data[2].reading_count).toBe(0);
  expect(hourly.body.data[3]).toEqual(
    expect.objectContaining({
      energy_Kwh: 0,
      reading_count: 1,
      reporting_installations: 1,
    }),
  );
  expect(hourly.body.data.reduce((sum, row) => sum + row.energy_Kwh, 0)).toBe(
    21,
  );
});
test('pagination counts buckets after zero-fill and preserves sorted links and snapped metadata', async () => {
  const res = await get('/v1/generation-trend', {
    from: '2026-10-08T18:31:00Z',
    to: '2026-10-11T18:29:00Z',
    sort: '-bucket_start',
    page_size: '1',
    page: '2',
  }).expect(200);
  expect(res.body.pagination).toEqual({
    page: 2,
    page_size: 1,
    total_count: 3,
    total_pages: 3,
  });
  expect(res.body.data[0].energy_Kwh).toBe(2);
  expect(res.body.meta.effective_from).toBe(start.toISOString());
  expect(res.body.meta.effective_to).toBe(end.toISOString());
  expect(new URL(res.body.links.next).searchParams.get('sort')).toBe(
    '-bucket_start',
  );
  expect(res.headers.link).toContain('rel="next"');
  expect(
    (await get('/v1/generation-trend', { page: '10' }).expect(200)).body.data,
  ).toEqual([]);
  const zero = await get(
    `/v1/installations/${fixture.dataset.fixtures.emptySiteId}/generation-trend`,
  ).expect(200);
  expect(zero.body.data).toHaveLength(3);
  expect(
    zero.body.data.every(
      (row) => row.energy_Kwh === 0 && row.reading_count === 0,
    ),
  ).toBe(true);
});
test('root scope and region/installation energy compose for every hierarchy level', async () => {
  for (const [name, type, energy] of [
    ['National Operator', 'national', 21],
    ['Western Province Officer', 'province', 21],
    ['Colombo District Officer', 'district', 21],
    ['Gampaha District Officer', 'district', 0],
  ]) {
    const res = await get('/v1/generation-trend', {}, name).expect(200);
    expect(res.body.meta.scope.type).toBe(type);
    expect(res.body.data.reduce((sum, row) => sum + row.energy_Kwh, 0)).toBe(
      energy,
    );
  }
  const province = await get(
    `/v1/provinces/${western.province_id}/generation-trend`,
  ).expect(200);
  let stationSum = 0,
    siteSum = 0;
  for (const station of fixture.dataset.substations.filter(
    (row) => row.district_id === colombo.district_id,
  ))
    stationSum += (
      await get(
        `/v1/grid-substations/${station.substation_id}/generation-trend`,
      ).expect(200)
    ).body.data.reduce((sum, row) => sum + row.energy_Kwh, 0);
  for (const site of sites)
    siteSum += (
      await get(`/v1/installations/${site.site_id}/generation-trend`).expect(
        200,
      )
    ).body.data.reduce((sum, row) => sum + row.energy_Kwh, 0);
  expect(siteSum).toBe(21);
  expect(stationSum).toBe(21);
  expect(province.body.data.reduce((sum, row) => sum + row.energy_Kwh, 0)).toBe(
    21,
  );
});
test('trend authorization precedes conditionals at every level; methods and query schemas are strict', async () => {
  const foreign = fixture.dataset.installations.find(
    (row) => row.name === 'Gampaha Rooftop Solar 1',
  );
  const foreignDistrict = fixture.dataset.districts.find(
    (row) => row.name === 'Gampaha',
  );
  for (const path of [
    `/v1/provinces/${western.province_id}/generation-trend`,
    `/v1/districts/${foreignDistrict.district_id}/generation-trend`,
    `/v1/grid-substations/${foreign.substation_id}/generation-trend`,
    `/v1/installations/${foreign.site_id}/generation-trend`,
  ])
    expectApiError(
      await get(path, {}, 'Colombo District Officer').set('If-None-Match', '*'),
      403,
      'FORBIDDEN_JURISDICTION',
    );
  const root = '/v1/generation-trend';
  for (const options of [
    { interval: 'week' },
    { from: 'bad' },
    { sort: 'name' },
    { extra: '1' },
    { from: end.toISOString() },
    {
      interval: 'hour',
      to: new Date(start.getTime() + 7 * 86400000 + 1).toISOString(),
    },
    { to: new Date(start.getTime() + 92 * 86400000 + 1).toISOString() },
    { from: [start.toISOString(), start.toISOString()] },
  ])
    expectApiError(await get(root, options), 400, 'INVALID_QUERY');
  expectApiError(
    await request(app)
      .get(root)
      .set('Authorization', auth())
      .query({ to: end.toISOString() }),
    400,
    'INVALID_QUERY',
  );
  for (const path of [
    root,
    `/v1/provinces/${western.province_id}/generation-trend`,
    `/v1/districts/${colombo.district_id}/generation-trend`,
    `/v1/grid-substations/${sites[0].substation_id}/generation-trend`,
    `/v1/installations/${sites[0].site_id}/generation-trend`,
  ]) {
    expectApiError(await request(app).get(path), 401, 'UNAUTHENTICATED');
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
    await get('/v1/installations/0/generation-trend'),
    400,
    'VALIDATION_FAILED',
  );
  expectApiError(
    await get('/v1/installations/2147483647/generation-trend'),
    404,
    'NOT_FOUND',
  );
});
test('trend ETags obey 304 and precondition ordering', async () => {
  const first = await get().expect(200);
  const cached = await get()
    .set('If-None-Match', first.headers.etag)
    .expect(304);
  expect(cached.text).toBe('');
  expectApiError(
    await get()
      .set('If-Match', '"wrong"')
      .set('If-None-Match', first.headers.etag),
    412,
    'PRECONDITION_FAILED',
  );
});
