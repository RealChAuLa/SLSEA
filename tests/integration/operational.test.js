import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createTestDatabase } from '../helpers/db.js';
import { expectApiError } from '../helpers/expect-api-error.js';
import { generateSeries } from '../../prisma/seed-lib/generator.js';
import { startOfLocalDay } from '../../src/utils/time.js';

jest.setTimeout(60000);
const end = new Date('2026-10-09T12:00:00Z');
let fixture, app, users, site, foreign;
let queries = 0;
beforeAll(async () => {
  fixture = await createTestDatabase({
    history: true,
    endTimestamp: end,
    queryLogging: true,
  });
  users = await fixture.db.user.findMany();
  site = fixture.dataset.installations.find(
    (row) => row.name === 'Colombo Rooftop Solar 1',
  );
  foreign = fixture.dataset.installations.find(
    (row) => row.name === 'Gampaha Rooftop Solar 1',
  );
  app = createApp({
    db: fixture.db,
    tokens: fixture.tokens,
    clock: () => end,
    logger: { info() {}, error() {} },
  });
  fixture.db.$on('query', () => {
    queries += 1;
  });
}, 60000);
afterAll(async () => {
  await fixture?.db.$disconnect();
});
const auth = (name = 'National Operator') =>
  `Bearer ${fixture.tokens.signUserToken(users.find((user) => user.name === name))}`;
const get = (path, name) =>
  request(app)
    .get(path)
    .set('Host', 'api.example.test')
    .set('Authorization', auth(name));
const url = (siteId, kind) => `/v1/installations/${siteId}/${kind}`;
test('normal/offline/empty last-known readings report freshness and source timestamps', async () => {
  const normal = await get(url(site.site_id, 'last-known-reading')).expect(200);
  expect(normal.body.site_id).toBe(site.site_id);
  expect(normal.body.meter_id).toBe(site.meter_id);
  expect(normal.body.timestamp).toBe(end.toISOString());
  expect(normal.body.age_seconds).toBe(0);
  expect(normal.body.is_stale).toBe(false);
  expect(normal.headers['last-modified']).toBe(end.toUTCString());
  const offline = await get(
    url(fixture.dataset.fixtures.offlineSiteId, 'last-known-reading'),
  ).expect(200);
  expect(offline.body.age_seconds).toBe(21600);
  expect(offline.body.is_stale).toBe(true);
  expectApiError(
    await get(url(fixture.dataset.fixtures.emptySiteId, 'last-known-reading')),
    404,
    'NOT_FOUND',
  );
  await get(url(site.site_id, 'last-known-reading'))
    .set('If-None-Match', normal.headers.etag)
    .expect(304);
  await get(url(site.site_id, 'last-known-reading'))
    .set('If-Modified-Since', normal.headers['last-modified'])
    .expect(304);
});
test('overview includes the explicit hierarchy and handles empty installation with null/zero values', async () => {
  const normal = await get(url(site.site_id, 'overview')).expect(200);
  expect(normal.body).toEqual({
    ...site,
    substation: {
      substation_id: site.substation_id,
      name: 'Colombo Grid Substation 1',
    },
    district: {
      district_id: fixture.dataset.districts.find(
        (row) => row.name === 'Colombo',
      ).district_id,
      name: 'Colombo',
    },
    province: {
      province_id: fixture.dataset.provinces.find(
        (row) => row.name === 'Western',
      ).province_id,
      name: 'Western',
    },
    last_known_reading: expect.objectContaining({
      timestamp: end.toISOString(),
      is_stale: false,
    }),
    today: {
      energy_Kwh: expect.any(Number),
      peak_power_Kw: expect.any(Number),
      reading_count: expect.any(Number),
    },
  });
  expect(normal.body.last_known_reading.site_id).toBeUndefined();
  expect(normal.body.last_known_reading.meter_id).toBeUndefined();
  expect(normal.headers['last-modified']).toBeUndefined();
  const empty = await get(
    url(fixture.dataset.fixtures.emptySiteId, 'overview'),
  ).expect(200);
  expect(empty.body.last_known_reading).toBeNull();
  expect(empty.body.today).toEqual({
    energy_Kwh: 0,
    peak_power_Kw: 0,
    reading_count: 0,
  });
});
test('today energy uses the previous-day baseline, then falls back to the first reading today', async () => {
  const fallback = fixture.dataset.installations.find(
    (row) => row.name === 'Colombo Rooftop Solar 2',
  );
  const midnight = startOfLocalDay(end);
  const make = (meter_id, timestamp, energy, power) => ({
    meter_id,
    timestamp,
    cumulative_energy_Kwh: energy,
    power_Kw: power,
    voltage: 230,
  });
  await fixture.db.generationReading.deleteMany({
    where: { meter_id: { in: [site.meter_id, fallback.meter_id] } },
  });
  try {
    await fixture.db.generationReading.createMany({
      data: [
        make(site.meter_id, new Date(midnight.getTime() - 900000), 100, 1),
        make(site.meter_id, midnight, 103, 2),
        make(site.meter_id, new Date(midnight.getTime() + 900000), 108, 4),
        make(site.meter_id, end, 115, 3),
        make(fallback.meter_id, midnight, 200, 1),
        make(fallback.meter_id, end, 208, 2),
      ],
    });
    const baseline = await get(url(site.site_id, 'overview')).expect(200);
    expect(baseline.body.today).toEqual({
      energy_Kwh: 15,
      peak_power_Kw: 4,
      reading_count: 3,
    });
    const first = await get(url(fallback.site_id, 'overview')).expect(200);
    expect(first.body.today).toEqual({
      energy_Kwh: 8,
      peak_power_Kw: 2,
      reading_count: 2,
    });
  } finally {
    await fixture.db.generationReading.deleteMany({
      where: { meter_id: { in: [site.meter_id, fallback.meter_id] } },
    });
    await fixture.db.generationReading.createMany({
      data: [
        ...generateSeries({
          site_id: site.site_id,
          meter_id: site.meter_id,
          endTimestamp: end,
          count: 192,
        }),
        ...generateSeries({
          site_id: fallback.site_id,
          meter_id: fallback.meter_id,
          endTimestamp: end,
          count: 192,
        }),
      ],
    });
  }
});
test('reporting filtering occurs before pagination and include handles stale/empty nested readings', async () => {
  const total = fixture.dataset.installations.length;
  const fresh = await get(
    '/v1/installations?reporting=true&include=last_known_reading&page_size=5',
  ).expect(200);
  expect(fresh.body.pagination.total_count).toBe(total - 2);
  expect(fresh.body.data).toHaveLength(5);
  expect(
    fresh.body.data.every(
      (row) => row.last_known_reading && !row.last_known_reading.is_stale,
    ),
  ).toBe(true);
  const absent = await get(
    '/v1/installations?reporting=false&include=last_known_reading&page_size=1',
  ).expect(200);
  expect(absent.body.pagination.total_count).toBe(2);
  expect(absent.body.data[0].site_id).toBe(
    fixture.dataset.fixtures.offlineSiteId,
  );
  expect(absent.body.data[0].last_known_reading.is_stale).toBe(true);
  const empty = await get(
    '/v1/installations?reporting=false&include=last_known_reading&page_size=1&page=2',
  ).expect(200);
  expect(empty.body.data[0].site_id).toBe(fixture.dataset.fixtures.emptySiteId);
  expect(empty.body.data[0].last_known_reading).toBeNull();
  expect(empty.body.links.next).toBeNull();
  const sub = await get(
    `/v1/grid-substations/${site.substation_id}/installations?reporting=true&include=last_known_reading`,
  ).expect(200);
  expect(
    sub.body.data.every(
      (row) =>
        row.substation_id === site.substation_id && row.last_known_reading,
    ),
  ).toBe(true);
  for (const name of ['Western Province Officer', 'Colombo District Officer']) {
    const scoped = await get(
      '/v1/installations?reporting=false&include=last_known_reading',
      name,
    ).expect(200);
    expect(scoped.body.data).toEqual([]);
    expect(scoped.body.pagination.total_count).toBe(0);
  }
  const narrowed = await get(
    `/v1/installations?reporting=true&district_id=${fixture.dataset.districts.find((row) => row.name === 'Colombo').district_id}&include=last_known_reading`,
    'Colombo District Officer',
  ).expect(200);
  expect(narrowed.body.pagination.total_count).toBe(6);
  expect(
    narrowed.body.data.every((row) => row.name.startsWith('Colombo')),
  ).toBe(true);
});
test('page includes use a constant query count as page size grows', async () => {
  for (const base of [
    '/v1/installations',
    `/v1/grid-substations/${fixture.dataset.substations.find((row) => row.name === 'Nuwara Eliya Grid Substation 1').substation_id}/installations`,
  ]) {
    queries = 0;
    await get(
      `${base}?page_size=1&include=last_known_reading&reporting=true`,
    ).expect(200);
    const small = queries;
    queries = 0;
    await get(
      `${base}?page_size=20&include=last_known_reading&reporting=true`,
    ).expect(200);
    const large = queries;
    expect(small).toBeGreaterThan(0);
    expect(large).toBe(small);
  }
});
test('operational options are strict and cannot bypass jurisdiction or authentication', async () => {
  for (const query of [
    'reporting=maybe',
    'reporting=true&reporting=false',
    'include=other',
    'include=last_known_reading&include=other',
  ])
    expectApiError(
      await get(`/v1/installations?${query}`),
      400,
      'INVALID_QUERY',
    );
  for (const kind of ['last-known-reading', 'overview']) {
    const path = url(site.site_id, kind);
    expectApiError(await get(`${path}?unexpected=1`), 400, 'INVALID_QUERY');
    expectApiError(
      await get(url(foreign.site_id, kind), 'Colombo District Officer').set(
        'If-None-Match',
        '*',
      ),
      403,
      'FORBIDDEN_JURISDICTION',
    );
    expectApiError(
      await request(app).get(path).set('If-None-Match', '*'),
      401,
      'UNAUTHENTICATED',
    );
    expectApiError(
      await request(app)
        .get(path)
        .set('Authorization', `Bearer ${fixture.tokens.signDeviceToken(site)}`),
      403,
      'FORBIDDEN_SCOPE',
    );
    expectApiError(await get(url(2147483647, kind)), 404, 'NOT_FOUND');
    for (const method of [
      'post',
      'put',
      'patch',
      'delete',
      'head',
      'options',
    ]) {
      const agent = request(app);
      const res = await agent[method](path).set(
        'Content-Type',
        'application/json',
      );
      expect(res.status).toBe(405);
      expect(res.headers.allow).toBe('GET');
    }
  }
  const forbidden = `/v1/grid-substations/${foreign.substation_id}/installations?reporting=true&include=last_known_reading`;
  expectApiError(
    await get(forbidden, 'Colombo District Officer'),
    403,
    'FORBIDDEN_JURISDICTION',
  );
});
