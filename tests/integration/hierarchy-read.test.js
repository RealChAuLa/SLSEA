import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createTestDatabase } from '../helpers/db.js';
import { expectApiError } from '../helpers/expect-api-error.js';
import { resolveHierarchy } from '../../src/services/hierarchy.js';

jest.setTimeout(60000);
let fixture;
let app;
let users;
let own;
let sibling;
let foreign;
const byName = (rows, name) => rows.find((row) => row.name === name);
beforeAll(async () => {
  fixture = await createTestDatabase();
  users = await fixture.db.user.findMany();
  app = createApp({
    db: fixture.db,
    tokens: fixture.tokens,
    logger: { info() {}, error() {} },
  });
  const target = (province, district) => ({
    province: byName(fixture.dataset.provinces, province),
    district: byName(fixture.dataset.districts, district),
    substation: byName(
      fixture.dataset.substations,
      `${district} Grid Substation 1`,
    ),
    installation: byName(
      fixture.dataset.installations,
      `${district} Rooftop Solar 1`,
    ),
  });
  own = target('Western', 'Colombo');
  sibling = target('Western', 'Gampaha');
  foreign = target('Central', 'Kandy');
}, 60000);
afterAll(async () => {
  await fixture?.db.$disconnect();
});
const userFor = (role) =>
  users.find(
    (user) =>
      user.name ===
      {
        national: 'National Operator',
        provincial: 'Western Province Officer',
        district: 'Colombo District Officer',
      }[role],
  );
const auth = (role) => `Bearer ${fixture.tokens.signUserToken(userFor(role))}`;
const paths = (target) => [
  ['/v1/provinces', 'province', null],
  [`/v1/provinces/${target.province.province_id}`, 'province', target.province],
  [`/v1/provinces/${target.province.province_id}/districts`, 'district', null],
  [`/v1/districts/${target.district.district_id}`, 'district', target.district],
  [
    `/v1/districts/${target.district.district_id}/grid-substations`,
    'substation',
    null,
  ],
  [
    `/v1/grid-substations/${target.substation.substation_id}`,
    'substation',
    target.substation,
  ],
  [
    `/v1/grid-substations/${target.substation.substation_id}/installations`,
    'installation',
    null,
  ],
  ['/v1/installations', 'installation', null],
  [
    `/v1/installations/${target.installation.site_id}`,
    'installation',
    target.installation,
  ],
];
function expectedRows(path, resource, role) {
  const dataset = fixture.dataset;
  const rows =
    dataset[
      {
        province: 'provinces',
        district: 'districts',
        substation: 'substations',
        installation: 'installations',
      }[resource]
    ];
  return rows.filter((row) => {
    const sub =
      resource === 'installation'
        ? dataset.substations.find(
            (sub) => sub.substation_id === row.substation_id,
          )
        : row;
    const district = ['substation', 'installation'].includes(resource)
      ? dataset.districts.find((d) => d.district_id === sub.district_id)
      : row;
    const provinceId =
      resource === 'province' ? row.province_id : district.province_id;
    const districtId = resource === 'province' ? null : district.district_id;
    const inScope =
      role === 'national' ||
      (role === 'provincial'
        ? provinceId === own.province.province_id
        : resource === 'province'
          ? provinceId === own.province.province_id
          : districtId === own.district.district_id);
    if (!inScope) return false;
    if (path.endsWith('/districts'))
      return row.province_id === own.province.province_id;
    if (path.endsWith('/grid-substations'))
      return row.district_id === own.district.district_id;
    if (
      path.startsWith('/v1/grid-substations/') &&
      path.endsWith('/installations')
    )
      return row.substation_id === own.substation.substation_id;
    return true;
  });
}
for (const role of ['national', 'provincial', 'district']) {
  test(`${role} sees the exact allowed representation at every I3 endpoint`, async () => {
    for (const [path, resource, atomic] of paths(own)) {
      const res = await request(app)
        .get(path)
        .set('Authorization', auth(role))
        .expect(200);
      expect(res.headers['cache-control']).toBe('private, no-cache');
      expect(res.headers.vary).toContain('Authorization');
      expect(res.headers['last-modified']).toBeUndefined();
      if (atomic) expect(res.body).toEqual(atomic);
      else {
        const expected = expectedRows(path, resource, role);
        expect(res.body.data).toEqual(expected);
        expect(res.body.pagination.total_count).toBe(expected.length);
        expect(res.headers.link).toContain('rel="first"');
      }
    }
  });
  test(`${role} handles direct and parent-list cross-jurisdiction addresses consistently`, async () => {
    for (const target of [sibling, foreign]) {
      for (const [path] of paths(target).filter(
        ([path]) => !['/v1/provinces', '/v1/installations'].includes(path),
      )) {
        const provinceOnly =
          path === `/v1/provinces/${target.province.province_id}` ||
          path === `/v1/provinces/${target.province.province_id}/districts`;
        const allowed =
          role === 'national' ||
          (role === 'provincial' && target === sibling) ||
          (role === 'district' && target === sibling && provinceOnly);
        const res = await request(app)
          .get(path)
          .set('Authorization', auth(role));
        if (allowed) expect(res.status).toBe(200);
        else expectApiError(res, 403, 'FORBIDDEN_JURISDICTION');
        if (
          role === 'district' &&
          target === sibling &&
          path.endsWith('/districts')
        )
          expect(res.body.data).toEqual([own.district]);
      }
    }
  });
}
test('installation filters intersect scope and each other without widening visibility', async () => {
  for (const role of ['national', 'provincial', 'district']) {
    const expected = expectedRows('/v1/installations', 'installation', role);
    const unfiltered = await request(app)
      .get('/v1/installations')
      .set('Authorization', auth(role))
      .expect(200);
    expect(unfiltered.body.data).toEqual(expected);
    for (const [field, id] of [
      ['province_id', own.province.province_id],
      ['district_id', own.district.district_id],
      ['substation_id', own.substation.substation_id],
    ]) {
      const res = await request(app)
        .get('/v1/installations')
        .query({ [field]: id })
        .set('Authorization', auth(role))
        .expect(200);
      expect(
        res.body.data.every((site) =>
          expected.some((row) => row.site_id === site.site_id),
        ),
      ).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    }
  }
  const contradictory = await request(app)
    .get('/v1/installations')
    .query({
      province_id: own.province.province_id,
      district_id: foreign.district.district_id,
    })
    .set('Authorization', auth('national'))
    .expect(200);
  expect(contradictory.body.data).toEqual([]);
  expect(contradictory.body.pagination.total_count).toBe(0);
  expect(contradictory.body.links.prev).toBeNull();
  expect(contradictory.body.links.next).toBeNull();
  for (const field of ['province_id', 'district_id', 'substation_id']) {
    const id =
      foreign[
        {
          province_id: 'province',
          district_id: 'district',
          substation_id: 'substation',
        }[field]
      ][field];
    expectApiError(
      await request(app)
        .get('/v1/installations')
        .query({ [field]: id })
        .set('Authorization', auth('district')),
      403,
      'FORBIDDEN_JURISDICTION',
    );
    expectApiError(
      await request(app)
        .get('/v1/installations')
        .query({ [field]: 2147483647 })
        .set('Authorization', auth('national')),
      404,
      'NOT_FOUND',
    );
  }
});
test('pagination covers first/middle/last/beyond, configured bounds and forwarded links', async () => {
  const total = fixture.dataset.installations.length;
  for (const page of [1, 2, Math.ceil(total / 5), 99]) {
    const res = await request(app)
      .get('/v1/installations')
      .query({
        page,
        page_size: 5,
        sort: 'name',
        district_id: own.district.district_id,
      })
      .set('Authorization', auth('national'))
      .set('X-Forwarded-Proto', 'https')
      .set('X-Forwarded-Host', 'api.example.test')
      .expect(200);
    expect(res.body.pagination).toEqual({
      page,
      page_size: 5,
      total_count: 6,
      total_pages: 2,
    });
    expect(res.body.data).toHaveLength(page === 1 ? 5 : page === 2 ? 1 : 0);
    const link = new URL(res.body.links.self);
    expect(link.origin).toBe('https://api.example.test');
    expect(link.searchParams.get('district_id')).toBe(
      String(own.district.district_id),
    );
    expect(link.searchParams.get('sort')).toBe('name');
    expect(link.searchParams.get('page')).toBe(String(page));
    expect(res.body.links.prev === null).toBe(page === 1);
    expect(res.body.links.next === null).toBe(page >= 2);
  }
  for (const query of [
    { page: '0' },
    { page: '-1' },
    { page: '1.5' },
    { page: 'NaN' },
    { page_size: '0' },
    { page_size: '501' },
    { page_size: '3abc' },
    { page_size: ['1', '2'] },
  ])
    expectApiError(
      await request(app)
        .get('/v1/installations')
        .query(query)
        .set('Authorization', auth('national')),
      400,
      'INVALID_QUERY',
    );
});
test('sort direction, strict query and path validation applies to every hierarchy GET', async () => {
  const asc = await request(app)
    .get('/v1/installations?sort=name')
    .set('Authorization', auth('national'))
    .expect(200);
  const desc = await request(app)
    .get('/v1/installations?sort=-name')
    .set('Authorization', auth('national'))
    .expect(200);
  expect(desc.body.data).toEqual([...asc.body.data].reverse());
  for (const [path, , atomic] of paths(own)) {
    expectApiError(
      await request(app)
        .get(path)
        .query({ unexpected: 'x' })
        .set('Authorization', auth('national')),
      400,
      'INVALID_QUERY',
    );
    if (!atomic)
      expectApiError(
        await request(app)
          .get(path)
          .query({ sort: 'password_hash' })
          .set('Authorization', auth('national')),
        400,
        'INVALID_QUERY',
      );
  }
  for (const path of [
    '/v1/provinces/nope',
    '/v1/districts/0',
    '/v1/grid-substations/1.2',
    '/v1/installations/2147483648',
  ])
    expectApiError(
      await request(app).get(path).set('Authorization', auth('national')),
      400,
      'VALIDATION_FAILED',
    );
  for (const path of [
    '/v1/provinces/2147483647',
    '/v1/provinces/2147483647/districts',
    '/v1/districts/2147483647',
    '/v1/districts/2147483647/grid-substations',
    '/v1/grid-substations/2147483647',
    '/v1/grid-substations/2147483647/installations',
    '/v1/installations/2147483647',
  ])
    expectApiError(
      await request(app).get(path).set('Authorization', auth('district')),
      404,
      'NOT_FOUND',
    );
});
test('all I3 endpoints enforce authentication and token type before conditional responses', async () => {
  const device = `Bearer ${fixture.tokens.signDeviceToken(fixture.dataset.installations[0])}`;
  for (const [path] of paths(own)) {
    expectApiError(
      await request(app).get(path).set('If-None-Match', '*'),
      401,
      'UNAUTHENTICATED',
    );
    expectApiError(
      await request(app)
        .get(path)
        .set('Authorization', device)
        .set('If-Match', '"wrong"'),
      403,
      'FORBIDDEN_SCOPE',
    );
    const current = await request(app)
      .get(path)
      .set('Host', 'api.example.test')
      .set('Authorization', auth('district'))
      .expect(200);
    const cached = await request(app)
      .get(path)
      .set('Host', 'api.example.test')
      .set('Authorization', auth('district'))
      .set('If-None-Match', current.headers.etag)
      .expect(304);
    expect(cached.text).toBe('');
    expect(cached.headers.etag).toBe(current.headers.etag);
    expectApiError(
      await request(app)
        .get(path)
        .set('Authorization', auth('district'))
        .set('If-Match', '"wrong"'),
      412,
      'PRECONDITION_FAILED',
    );
  }
  for (const [path] of paths(foreign).filter(
    ([path]) => !['/v1/provinces', '/v1/installations'].includes(path),
  )) {
    expectApiError(
      await request(app)
        .get(path)
        .set('Authorization', auth('district'))
        .set('If-None-Match', '*')
        .set('If-Match', '"wrong"'),
      403,
      'FORBIDDEN_JURISDICTION',
    );
  }
});

test('a cached broader collection cannot bypass a narrower caller scope', async () => {
  const national = await request(app)
    .get('/v1/installations')
    .set('Host', 'api.example.test')
    .set('Authorization', auth('national'))
    .expect(200);
  const district = await request(app)
    .get('/v1/installations')
    .set('Host', 'api.example.test')
    .set('Authorization', auth('district'))
    .set('If-None-Match', national.headers.etag)
    .expect(200);
  expect(district.headers.etag).not.toBe(national.headers.etag);
  expect(district.body.data).toEqual(
    expectedRows('/v1/installations', 'installation', 'district'),
  );
});
test('every unsupported method on every hierarchy path returns exact Allow', async () => {
  for (const [path] of paths(own))
    for (const method of [
      'post',
      'patch',
      'put',
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
});
test('hierarchy lookup resolves each depth in one parameterized database query', async () => {
  const query = jest.fn((...args) => fixture.db.$queryRaw(...args));
  const db = { $queryRaw: query };
  for (const [level, key] of [
    ['province', 'province_id'],
    ['district', 'district_id'],
    ['substation', 'substation_id'],
    ['installation', 'site_id'],
  ]) {
    query.mockClear();
    const chain = await resolveHierarchy(db, level, own[level][key]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(chain.province_id).toBe(own.province.province_id);
    if (level !== 'province')
      expect(chain.district_id).toBe(own.district.district_id);
  }
});
