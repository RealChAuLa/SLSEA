import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createTestDatabase } from '../helpers/db.js';
import { expectApiError } from '../helpers/expect-api-error.js';
import { selfCheckReadings } from '../../prisma/seed-lib/history.js';

jest.setTimeout(60000);
const end = new Date('2026-10-09T12:00:00Z');
let fixture, app, users, site, foreign;
beforeAll(async () => {
  fixture = await createTestDatabase({ history: true, endTimestamp: end });
  users = await fixture.db.user.findMany();
  app = createApp({
    db: fixture.db,
    tokens: fixture.tokens,
    clock: () => end,
    logger: { info() {}, error() {} },
  });
  site = fixture.dataset.installations.find(
    (row) => row.name === 'Colombo Rooftop Solar 1',
  );
  foreign = fixture.dataset.installations.find(
    (row) => row.name === 'Gampaha Rooftop Solar 1',
  );
}, 60000);
afterAll(async () => {
  await fixture?.db.$disconnect();
});
const auth = (name) =>
  `Bearer ${fixture.tokens.signUserToken(users.find((user) => user.name === name))}`;
const get = (path, user = 'National Operator') =>
  request(app)
    .get(path)
    .set('Host', 'api.example.test')
    .set('Authorization', auth(user));
const path = () => `/v1/installations/${site.site_id}/readings`;
test('test-scale history self-check verifies all intervals and fixture rules', async () => {
  const summary = await selfCheckReadings(fixture.db, fixture.dataset, {
    end,
    count: 192,
  });
  expect(summary.readings).toBe(6696);
  expect(fixture.historySummary.offlineGapHours).toBe(6);
});
test('site history is paginated, serializes UTC and supports both chronological directions', async () => {
  const first = await get(`${path()}?page_size=5`).expect(200);
  expect(first.body.pagination).toEqual({
    page: 1,
    page_size: 5,
    total_count: 192,
    total_pages: 39,
  });
  expect(first.body.data[0]).toEqual({
    site_id: site.site_id,
    meter_id: site.meter_id,
    timestamp: end.toISOString(),
    power_Kw: expect.any(Number),
    cumulative_energy_Kwh: expect.any(Number),
    voltage: expect.any(Number),
  });
  expect(first.headers['last-modified']).toBe(end.toUTCString());
  expect(first.headers.link).toContain('rel="next"');
  const last = await get(`${path()}?page=39&page_size=5`).expect(200);
  expect(last.body.data).toHaveLength(2);
  expect(last.body.links.next).toBeNull();
  const beyond = await get(`${path()}?page=40&page_size=5`).expect(200);
  expect(beyond.body.data).toEqual([]);
  expect(beyond.body.pagination.total_count).toBe(192);
  expect(beyond.headers['last-modified']).toBeUndefined();
  const ascending = await get(`${path()}?sort=timestamp&page_size=192`).expect(
    200,
  );
  const descending = await get(
    `${path()}?sort=-timestamp&page_size=192`,
  ).expect(200);
  expect(ascending.body.data).toEqual([...descending.body.data].reverse());
  expect(ascending.headers['last-modified']).toBe(end.toUTCString());
});
test('ISO offsets and inclusive/exclusive window boundaries work for site history', async () => {
  const from = new Date(end.getTime() - 60 * 60000);
  const until = new Date(end.getTime() - 15 * 60000);
  const res = await get(path())
    .query({
      from: from.toISOString(),
      to: until.toISOString(),
      sort: 'timestamp',
    })
    .expect(200);
  expect(res.body.data.map((row) => row.timestamp)).toEqual(
    [
      from,
      new Date(from.getTime() + 15 * 60000),
      new Date(from.getTime() + 30 * 60000),
    ].map((date) => date.toISOString()),
  );
  const offset = await get(path())
    .query({
      from: '2026-10-09T16:30:00+05:30',
      to: '2026-10-09T17:15:00+05:30',
    })
    .expect(200);
  expect(offset.body.pagination.total_count).toBe(3);
  expectApiError(
    await get(`${path()}?from=2026-10-09T16:30:00+05:30`),
    400,
    'INVALID_QUERY',
  );
  const empty = await get(path())
    .query({ from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' })
    .expect(200);
  expect(empty.body.data).toEqual([]);
  for (const query of [
    { from: end.toISOString(), to: end.toISOString() },
    { from: 'bad' },
    { to: ['a', 'b'] },
    { sort: 'name' },
    { unexpected: '1' },
  ])
    expectApiError(await get(path()).query(query), 400, 'INVALID_QUERY');
});
test('atomic reading parses path timestamp, rejects missing readings and unknown query', async () => {
  const atomic = `${path()}/${encodeURIComponent(end.toISOString())}`;
  const res = await get(atomic).expect(200);
  expect(res.body.site_id).toBe(site.site_id);
  expect(res.headers['last-modified']).toBe(end.toUTCString());
  const offset = await get(
    `${path()}/${encodeURIComponent('2026-10-09T17:30:00+05:30')}`,
  ).expect(200);
  expect(offset.body).toEqual(res.body);
  expectApiError(await get(`${path()}/bad`), 400, 'VALIDATION_FAILED');
  expectApiError(
    await get(`${path()}/${encodeURIComponent('2026-10-09T12:01:00Z')}`),
    404,
    'NOT_FOUND',
  );
  expectApiError(await get(`${atomic}?page=1`), 400, 'INVALID_QUERY');
});
test('root reading defaults and filters only narrow caller jurisdiction', async () => {
  for (const name of [
    'National Operator',
    'Western Province Officer',
    'Colombo District Officer',
  ]) {
    const user = users.find((row) => row.name === name);
    const allowed = fixture.dataset.installations.filter((installation) => {
      const sub = fixture.dataset.substations.find(
        (row) => row.substation_id === installation.substation_id,
      );
      const district = fixture.dataset.districts.find(
        (row) => row.district_id === sub.district_id,
      );
      return (
        user.jurisdiction_type === 'national' ||
        (user.jurisdiction_type === 'provincial'
          ? district.province_id === user.jurisdiction_id
          : district.district_id === user.jurisdiction_id)
      );
    });
    const res = await get('/v1/readings?page_size=500', name).expect(200);
    const expected = allowed.reduce(
      (sum, row) =>
        sum +
        (row.site_id === fixture.dataset.fixtures.emptySiteId
          ? 0
          : row.site_id === fixture.dataset.fixtures.offlineSiteId
            ? 73
            : 96),
      0,
    );
    expect(res.body.pagination.total_count).toBe(expected);
    expect(
      res.body.data.every((row) =>
        allowed.some((item) => item.site_id === row.site_id),
      ),
    ).toBe(true);
  }
  const narrow = await get(
    `/v1/readings?site_id=${site.site_id}`,
    'Colombo District Officer',
  ).expect(200);
  expect(narrow.body.pagination.total_count).toBe(96);
  const contradictory = await get(
    `/v1/readings?site_id=${site.site_id}&substation_id=${foreign.substation_id}`,
  ).expect(200);
  expect(contradictory.body.data).toEqual([]);
  expectApiError(
    await get(
      `/v1/readings?site_id=${foreign.site_id}`,
      'Colombo District Officer',
    ),
    403,
    'FORBIDDEN_JURISDICTION',
  );
  expectApiError(
    await get(
      `/v1/installations/${foreign.site_id}/readings`,
      'Colombo District Officer',
    ),
    403,
    'FORBIDDEN_JURISDICTION',
  );
  expectApiError(
    await get(
      `/v1/installations/${foreign.site_id}/readings/${encodeURIComponent(end.toISOString())}`,
      'Colombo District Officer',
    ),
    403,
    'FORBIDDEN_JURISDICTION',
  );
  for (const field of [
    'province_id',
    'district_id',
    'substation_id',
    'site_id',
  ])
    expectApiError(
      await get(`/v1/readings?${field}=2147483647`),
      404,
      'NOT_FOUND',
    );
  for (const query of [
    { from: '2026-08-01T00:00:00Z' },
    { from: '2026-10-10T00:00:00Z' },
    { site_id: '-1' },
    { from: '2026-02-30T00:00:00Z' },
    { reporting: 'true' },
  ])
    expectApiError(
      await get('/v1/readings').query(query),
      400,
      'INVALID_QUERY',
    );
});
test('history conditionals prioritize ETags and never bypass authentication/jurisdiction', async () => {
  const res = await get(path()).expect(200);
  await get(path()).set('If-None-Match', res.headers.etag).expect(304);
  await get(path())
    .set('If-Modified-Since', res.headers['last-modified'])
    .expect(304);
  await get(path()).set('If-Modified-Since', 'invalid').expect(200);
  await get(path())
    .set('If-Modified-Since', res.headers['last-modified'])
    .set('If-None-Match', '"other"')
    .expect(200);
  expectApiError(
    await get(path())
      .set('If-Match', '"wrong"')
      .set('If-Modified-Since', res.headers['last-modified']),
    412,
    'PRECONDITION_FAILED',
  );
  expectApiError(
    await request(app)
      .get(path())
      .set('If-Modified-Since', res.headers['last-modified']),
    401,
    'UNAUTHENTICATED',
  );
  expectApiError(
    await get(
      `/v1/installations/${foreign.site_id}/readings`,
      'Colombo District Officer',
    ).set('If-Modified-Since', res.headers['last-modified']),
    403,
    'FORBIDDEN_JURISDICTION',
  );
});
test('empty history, device GET denial and unsupported history methods are enforced', async () => {
  const empty = await get(
    `/v1/installations/${fixture.dataset.fixtures.emptySiteId}/readings`,
  ).expect(200);
  expect(empty.body.pagination.total_count).toBe(0);
  for (const url of [
    path(),
    `${path()}/${encodeURIComponent(end.toISOString())}`,
    '/v1/readings',
  ]) {
    const device = `Bearer ${fixture.tokens.signDeviceToken(site)}`;
    expectApiError(
      await request(app).get(url).set('Authorization', device),
      403,
      'FORBIDDEN_SCOPE',
    );
    for (const method of [
      ...(url === path() ? [] : ['post']),
      'put',
      'patch',
      'delete',
      'head',
      'options',
    ]) {
      const agent = request(app);
      const res = await agent[method](url).set(
        'Content-Type',
        'application/json',
      );
      expect(res.status).toBe(405);
      expect(res.headers.allow).toBe(url === path() ? 'GET, POST' : 'GET');
    }
  }
});
