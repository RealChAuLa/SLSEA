import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createTestDatabase } from '../helpers/db.js';
import { expectApiError } from '../helpers/expect-api-error.js';
jest.setTimeout(60000);
const originalPassword = 'Fixture#Password2026',
  newPassword = 'Brighter#Sun2027';
let fixture, app, users, originalHash;
const logger = { info: jest.fn(), error: jest.fn() };
beforeAll(async () => {
  fixture = await createTestDatabase();
  users = await fixture.db.user.findMany();
  originalHash = users[0].password_hash;
  app = createApp({ db: fixture.db, tokens: fixture.tokens, logger });
});
beforeEach(async () => {
  await fixture.db.user.updateMany({ data: { password_hash: originalHash } });
  logger.info.mockClear();
  logger.error.mockClear();
});
afterAll(async () => {
  await fixture?.db.$disconnect();
});
const user = (name) => users.find((row) => row.name === name);
const auth = (name) => `Bearer ${fixture.tokens.signUserToken(user(name))}`;
const get = (path, name = 'National Operator') =>
  request(app)
    .get(path)
    .set('Host', 'api.example.test')
    .set('Authorization', auth(name));
const patch = (path, name, input) =>
  request(app).patch(path).set('Authorization', auth(name)).send(input);
const login = (name, password) =>
  request(app)
    .post('/v1/auth/tokens')
    .send({ email: user(name).email, password });
test('manageable collections have correct scope, stable pagination, ETags and public fields', async () => {
  const expectations = {
    'National Operator': 5,
    'National Analyst': 5,
    'Western Province Officer': 2,
    'Central Province Officer': 1,
    'Colombo District Officer': 0,
    'Gampaha District Officer': 0,
    'Kandy District Officer': 0,
  };
  for (const [name, count] of Object.entries(expectations)) {
    const res = await get('/v1/users?page_size=2', name).expect(200);
    expect(res.body.pagination.total_count).toBe(count);
    expect(
      res.body.data.every((row) => row.user_id !== user(name).user_id),
    ).toBe(true);
    for (const row of res.body.data)
      expect(Object.keys(row).sort()).toEqual(
        [
          'user_id',
          'name',
          'email',
          'jurisdiction_type',
          'jurisdiction_id',
        ].sort(),
      );
    expect(res.headers['last-modified']).toBeUndefined();
    expect(res.headers.link).toContain('rel="first"');
    await get('/v1/users?page_size=2', name)
      .set('If-None-Match', res.headers.etag)
      .expect(304);
  }
  const names = (await get('/v1/users?sort=-name').expect(200)).body.data.map(
    (row) => row.name,
  );
  expect(names).toEqual([...names].sort().reverse());
  expect((await get('/v1/users?page=99').expect(200)).body.data).toEqual([]);
});
test('atomic users allow self or exactly manageable users; same-level and foreign profiles are denied', async () => {
  const allowed = {
    'National Operator': [
      'National Operator',
      'Western Province Officer',
      'Central Province Officer',
      'Colombo District Officer',
      'Gampaha District Officer',
      'Kandy District Officer',
    ],
    'National Analyst': [
      'National Analyst',
      'Western Province Officer',
      'Central Province Officer',
      'Colombo District Officer',
      'Gampaha District Officer',
      'Kandy District Officer',
    ],
    'Western Province Officer': [
      'Western Province Officer',
      'Colombo District Officer',
      'Gampaha District Officer',
    ],
    'Central Province Officer': [
      'Central Province Officer',
      'Kandy District Officer',
    ],
    'Colombo District Officer': ['Colombo District Officer'],
    'Gampaha District Officer': ['Gampaha District Officer'],
    'Kandy District Officer': ['Kandy District Officer'],
  };
  for (const caller of users)
    for (const target of users) {
      const res = await get(`/v1/users/${target.user_id}`, caller.name);
      if (allowed[caller.name].includes(target.name)) {
        expect(res.status).toBe(200);
        expect(res.body.user_id).toBe(target.user_id);
        expect(res.body.password_hash).toBeUndefined();
        expect(res.body.pv).toBeUndefined();
      } else expectApiError(res, 403, 'FORBIDDEN_JURISDICTION');
    }
  const me = await get('/v1/users/me', 'Colombo District Officer').expect(200);
  await get('/v1/users/me', 'Colombo District Officer')
    .set('If-None-Match', me.headers.etag)
    .expect(304);
  expectApiError(
    await get(`/v1/users/${user('National Analyst').user_id}`).set(
      'If-None-Match',
      '*',
    ),
    403,
    'FORBIDDEN_JURISDICTION',
  );
});
test.each([
  ['National Operator', 'Western Province Officer', true],
  ['National Operator', 'Colombo District Officer', true],
  ['Western Province Officer', 'Colombo District Officer', true],
  ['Western Province Officer', 'Kandy District Officer', false],
  ['Central Province Officer', 'Kandy District Officer', true],
  ['Colombo District Officer', 'Gampaha District Officer', false],
  ['Colombo District Officer', 'Western Province Officer', false],
  ['National Operator', 'National Analyst', false],
  ['Western Province Officer', 'Central Province Officer', false],
])('reset matrix %s → %s allowed=%s', async (caller, target, allowed) => {
  const res = await patch(`/v1/users/${user(target).user_id}`, caller, {
    new_password: newPassword,
  }).set('If-None-Match', '*');
  if (!allowed) {
    expectApiError(res, 403, 'FORBIDDEN_JURISDICTION');
    return;
  }
  expect(res.status).toBe(204);
  expect(res.text).toBe('');
  expectApiError(await get('/v1/users/me', target), 401, 'TOKEN_REVOKED');
  const fresh = await login(target, newPassword).expect(200);
  await request(app)
    .get('/v1/users/me')
    .set('Authorization', `Bearer ${fresh.body.access_token}`)
    .expect(200);
  expectApiError(await login(target, originalPassword), 401, 'UNAUTHENTICATED');
});
test('self-change rejects wrong current, policy failures, same password and extra fields', async () => {
  const name = 'Colombo District Officer';
  expectApiError(
    await patch('/v1/users/me', name, {
      current_password: 'wrong',
      new_password: newPassword,
    }),
    403,
    'CURRENT_PASSWORD_INCORRECT',
  );
  for (const input of [
    { current_password: originalPassword, new_password: originalPassword },
    { current_password: originalPassword, new_password: 'short1' },
    { current_password: originalPassword, new_password: '123456789012' },
    { current_password: originalPassword, new_password: 'noDigitsAtAll' },
    { current_password: originalPassword, new_password: 'é'.repeat(36) + '1' },
    {
      current_password: originalPassword,
      new_password: newPassword,
      user_id: 1,
    },
  ]) {
    const res = await patch('/v1/users/me', name, input);
    expectApiError(res, 400, 'VALIDATION_FAILED');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  }
  expectApiError(
    await patch(`/v1/users/${user(name).user_id}`, 'National Operator', {
      new_password: newPassword,
      current_password: originalPassword,
    }),
    400,
    'VALIDATION_FAILED',
  );
});
test('self-change revokes every old token and new login succeeds without password leakage', async () => {
  const name = 'National Analyst';
  const secondToken = (await login(name, originalPassword).expect(200)).body
    .access_token;
  await patch('/v1/users/me', name, {
    current_password: originalPassword,
    new_password: newPassword,
  }).expect(204);
  expectApiError(await get('/v1/users/me', name), 401, 'TOKEN_REVOKED');
  expectApiError(
    await request(app)
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${secondToken}`),
    401,
    'TOKEN_REVOKED',
  );
  expectApiError(await login(name, originalPassword), 401, 'UNAUTHENTICATED');
  const fresh = await login(name, newPassword).expect(200);
  const profile = await request(app)
    .get('/v1/users/me')
    .set('Authorization', `Bearer ${fresh.body.access_token}`)
    .expect(200);
  expect(profile.text).not.toContain('password_hash');
  expect(profile.text).not.toContain(newPassword);
  const logs = JSON.stringify([
    logger.info.mock.calls,
    logger.error.mock.calls,
  ]);
  expect(logs).not.toContain(newPassword);
  expect(logs).not.toContain(originalHash);
  expect(logs).not.toContain(secondToken);
});
test('numeric own-id PATCH follows exact self-change body and current-password rules', async () => {
  const name = 'Kandy District Officer',
    path = `/v1/users/${user(name).user_id}`;
  expectApiError(
    await patch(path, name, { new_password: newPassword }),
    400,
    'VALIDATION_FAILED',
  );
  expectApiError(
    await patch(path, name, {
      current_password: 'wrong',
      new_password: newPassword,
    }),
    403,
    'CURRENT_PASSWORD_INCORRECT',
  );
  await patch(path, name, {
    current_password: originalPassword,
    new_password: newPassword,
  }).expect(204);
  expectApiError(await get('/v1/users/me', name), 401, 'TOKEN_REVOKED');
  await login(name, newPassword).expect(200);
});
test('all account paths enforce identity, strict queries, IDs and declared methods', async () => {
  const target = `/v1/users/${user('Colombo District Officer').user_id}`;
  for (const path of ['/v1/users', '/v1/users/me', target]) {
    expectApiError(
      await request(app).get(path).set('If-None-Match', '*'),
      401,
      'UNAUTHENTICATED',
    );
    const credential = fixture.tokens.signDeviceToken(
      fixture.dataset.installations[0],
    );
    expectApiError(
      await request(app).get(path).set('Authorization', `Bearer ${credential}`),
      403,
      'FORBIDDEN_SCOPE',
    );
    if (path !== '/v1/users') {
      expectApiError(
        await request(app).patch(path).send({ new_password: newPassword }),
        401,
        'UNAUTHENTICATED',
      );
      expectApiError(
        await request(app)
          .patch(path)
          .set('Authorization', `Bearer ${credential}`)
          .send({ new_password: newPassword }),
        403,
        'FORBIDDEN_SCOPE',
      );
    }
    expectApiError(await get(`${path}?unexpected=1`), 400, 'INVALID_QUERY');
    for (const method of [
      'post',
      'put',
      'delete',
      'head',
      'options',
      ...(path === '/v1/users' ? ['patch'] : []),
    ]) {
      const res = await request(app)[method](path).type('json');
      expect(res.status).toBe(405);
      expect(res.headers.allow).toBe(
        path === '/v1/users' ? 'GET' : 'GET, PATCH',
      );
    }
  }
  expectApiError(
    await patch('/v1/users/me?extra=1', 'National Operator', {
      current_password: originalPassword,
      new_password: newPassword,
    }),
    400,
    'INVALID_QUERY',
  );
  expectApiError(
    await request(app)
      .patch('/v1/users/me')
      .set('Authorization', auth('National Operator'))
      .type('text')
      .send('x'),
    415,
    'UNSUPPORTED_MEDIA_TYPE',
  );
  expectApiError(await get('/v1/users/0'), 400, 'VALIDATION_FAILED');
  expectApiError(await get('/v1/users/2147483647'), 404, 'NOT_FOUND');
  expectApiError(
    await patch('/v1/users/2147483647', 'National Operator', {
      new_password: newPassword,
    }),
    404,
    'NOT_FOUND',
  );
  for (const query of [
    'sort=email',
    'page=0',
    'page_size=501',
    'sort=name&sort=-name',
  ])
    expectApiError(await get(`/v1/users?${query}`), 400, 'INVALID_QUERY');
});
test('concurrent self changes permit one update and revoke the competing old-token request', async () => {
  const name = 'National Analyst';
  const responses = await Promise.all([
    patch('/v1/users/me', name, {
      current_password: originalPassword,
      new_password: newPassword,
    }),
    patch('/v1/users/me', name, {
      current_password: originalPassword,
      new_password: 'Another#Sun2028',
    }),
  ]);
  expect(responses.map((res) => res.status).sort()).toEqual([204, 401]);
  expect(responses.find((res) => res.status === 401).body.error.code).toBe(
    'TOKEN_REVOKED',
  );
});
