import { jest } from '@jest/globals';
import { once } from 'node:events';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createTestDatabase } from '../helpers/db.js';
import { expectApiError } from '../helpers/expect-api-error.js';
import { simulateReadings } from '../../scripts/simulate.js';
jest.setTimeout(60000);
const end = new Date('2026-10-09T12:00:00Z');
let fixture, app, site, empty, user;
beforeAll(async () => {
  fixture = await createTestDatabase({
    history: true,
    endTimestamp: new Date(end.getTime() - 3600000),
  });
  site = fixture.dataset.installations.find(
    (row) => row.name === 'Colombo Rooftop Solar 1',
  );
  empty = fixture.dataset.installations.find(
    (row) => row.site_id === fixture.dataset.fixtures.emptySiteId,
  );
  user = await fixture.db.user.findFirst({
    where: { name: 'National Operator' },
  });
  app = createApp({
    db: fixture.db,
    tokens: fixture.tokens,
    clock: () => end,
    logger: { info() {}, error() {} },
  });
});
afterAll(async () => {
  await fixture?.db.$disconnect();
});
const path = (row) => `/v1/installations/${row.site_id}/readings`;
const device = (row) => `Bearer ${fixture.tokens.signDeviceToken(row)}`;
const staff = () => `Bearer ${fixture.tokens.signUserToken(user)}`;
const body = (timestamp = end.toISOString(), energy = 50000) => ({
  timestamp,
  power_Kw: 2,
  cumulative_energy_Kwh: energy,
  voltage: 230,
});
const post = (row, input, auth = device(row)) =>
  request(app)
    .post(path(row))
    .set('Host', 'api.example.test')
    .set('X-Forwarded-Proto', 'https')
    .set('Authorization', auth)
    .send(input);
test('create returns canonical Location and ETag, appears in all reads, and retry is 409', async () => {
  const created = await post(site, body('2026-10-09T17:30:00+05:30'))
    .set('If-None-Match', '*')
    .expect(201);
  expect(created.headers.location).toBe(
    `https://api.example.test${path(site)}/${encodeURIComponent(end.toISOString())}`,
  );
  expect(created.headers.etag).toMatch(/^"[a-f\d]{64}"$/);
  expect(created.body).toEqual({
    site_id: site.site_id,
    meter_id: site.meter_id,
    ...body(),
  });
  for (const resource of [
    `${path(site)}/${encodeURIComponent(end.toISOString())}`,
    `/v1/installations/${site.site_id}/last-known-reading`,
  ]) {
    const res = await request(app)
      .get(resource)
      .set('Authorization', staff())
      .expect(200);
    expect(res.body.cumulative_energy_Kwh).toBe(50000);
  }
  const history = await request(app)
    .get(path(site))
    .set('Authorization', staff())
    .expect(200);
  expect(history.body.pagination.total_count).toBe(193);
  expectApiError(await post(site, body()), 409, 'DUPLICATE_READING');
  expect(
    await fixture.db.generationReading.count({
      where: { meter_id: site.meter_id },
    }),
  ).toBe(193);
});
test('first device ingest makes the empty installation readable', async () => {
  await post(empty, body(end.toISOString(), 200)).expect(201);
  const latest = await request(app)
    .get(`/v1/installations/${empty.site_id}/last-known-reading`)
    .set('Authorization', staff())
    .expect(200);
  expect(latest.body.cumulative_energy_Kwh).toBe(200);
});
test('device identity, scope, unknown paths, query and media type checks precede writes', async () => {
  expectApiError(
    await request(app).post(path(site)).send(body()),
    401,
    'UNAUTHENTICATED',
  );
  expectApiError(await post(site, body(), staff()), 403, 'FORBIDDEN_SCOPE');
  expectApiError(
    await post(empty, body(), device(site)),
    403,
    'FORBIDDEN_INSTALLATION',
  );
  expectApiError(
    await post(site, body(), device({ ...site, meter_id: 'MTR-wrong' })),
    403,
    'FORBIDDEN_INSTALLATION',
  );
  expectApiError(
    await post({ site_id: 2147483647, meter_id: 'MTR-missing' }, body()),
    404,
    'NOT_FOUND',
  );
  expectApiError(
    await post(site, body()).query({ extra: 1 }),
    400,
    'INVALID_QUERY',
  );
  expectApiError(
    await post({ ...site, site_id: '0' }, body(), device(site)),
    400,
    'VALIDATION_FAILED',
  );
  expectApiError(
    await request(app)
      .post(path(site))
      .set('Authorization', device(site))
      .type('text')
      .send('x'),
    415,
    'UNSUPPORTED_MEDIA_TYPE',
  );
  for (const method of ['put', 'patch', 'delete', 'head', 'options']) {
    const res = await request(app)[method](path(site)).type('json');
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET, POST');
  }
});
test('invalid bodies and decreasing counters leave row count unchanged', async () => {
  const before = await fixture.db.generationReading.count({
    where: { meter_id: empty.meter_id },
  });
  const timestamp = new Date(end.getTime() + 60000).toISOString();
  for (const input of [
    { ...body(timestamp, 199) },
    { ...body(timestamp), site_id: empty.site_id },
    { ...body(timestamp), power_Kw: 51 },
    { ...body(timestamp), voltage: 149 },
    { ...body(timestamp), timestamp: '2026-10-09T12:06:00Z' },
    { ...body(timestamp), timestamp: '2026-09-08T12:00:00Z' },
    { ...body(timestamp), cumulative_energy_Kwh: -1 },
    {},
  ]) {
    const res = await post(empty, input);
    expectApiError(res, 400, 'VALIDATION_FAILED');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  }
  expect(
    await fixture.db.generationReading.count({
      where: { meter_id: empty.meter_id },
    }),
  ).toBe(before);
});
test('concurrent duplicate requests create exactly one reading', async () => {
  const input = body(new Date(end.getTime() + 120000).toISOString(), 201);
  const responses = await Promise.all([post(empty, input), post(empty, input)]);
  expect(responses.map((res) => res.status).sort()).toEqual([201, 409]);
});
test('simulator posts generated continuation over real HTTP and skips when up to date', async () => {
  const simulated = fixture.dataset.installations.find(
    (row) => row.name === 'Colombo Rooftop Solar 2',
  );
  const previous = await fixture.db.generationReading.findFirst({
    where: { meter_id: simulated.meter_id },
    orderBy: { timestamp: 'desc' },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const options = {
      db: fixture.db,
      tokenFile: fixture.tokenFile,
      clock: () => end,
      output() {},
      baseUrl: `http://127.0.0.1:${server.address().port}/`,
      siteId: simulated.site_id,
      count: 4,
    };
    const result = await simulateReadings(options);
    expect(result.created).toBe(4);
    expect(result.failed).toBe(0);
    const latest = await fixture.db.generationReading.findFirst({
      where: { meter_id: simulated.meter_id },
      orderBy: { timestamp: 'desc' },
    });
    expect(latest.timestamp).toEqual(end);
    expect(latest.cumulative_energy_Kwh).toBeGreaterThanOrEqual(
      previous.cumulative_energy_Kwh,
    );
    expect((await simulateReadings(options)).created).toBe(0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
