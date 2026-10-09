import { jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app.js';
import { createTestDatabase } from '../helpers/db.js';
import { expectApiError } from '../helpers/expect-api-error.js';
import { hashPassword } from '../../src/utils/password.js';

jest.setTimeout(45000);
let fixture;
let app;
let users;
beforeAll(async () => {
  fixture = await createTestDatabase();
  users = await fixture.db.user.findMany({ orderBy: { user_id: 'asc' } });
  app = createApp({
    db: fixture.db,
    tokens: fixture.tokens,
    logger: { info() {}, error() {} },
  });
}, 60000);
afterAll(async () => {
  await fixture?.db.$disconnect();
});
const bearer = (user) => `Bearer ${fixture.tokens.signUserToken(user)}`;

test('all seven users log in with case-normalized email and receive only public profile fields', async () => {
  for (const user of users) {
    const login = await request(app)
      .post('/v1/auth/tokens')
      .send({
        email: user.email.toUpperCase(),
        password: 'Fixture#Password2026',
      })
      .expect(200);
    expect(login.body).toEqual({
      access_token: expect.any(String),
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'generation:read account:manage',
    });
    const claims = fixture.tokens.verifyToken(login.body.access_token);
    expect(claims.sub).toBe(String(user.user_id));
    expect(claims.jurisdiction_type).toBe(user.jurisdiction_type);
    const res = await request(app)
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .expect(200);
    const profile = { ...user };
    delete profile.password_hash;
    expect(res.body).toEqual(profile);
    expect(res.text).not.toContain('password_hash');
    expect(res.text).not.toContain('pv');
    expect(res.headers['cache-control']).toBe('private, no-cache');
  }
});
test('unknown account and incorrect password return indistinguishable errors', async () => {
  const unknown = await request(app)
    .post('/v1/auth/tokens')
    .send({ email: 'missing@example.test', password: 'incorrect' });
  const wrong = await request(app)
    .post('/v1/auth/tokens')
    .send({ email: users[0].email, password: 'incorrect' });
  for (const res of [unknown, wrong]) {
    expectApiError(res, 401, 'UNAUTHENTICATED');
    expect(res.headers['www-authenticate']).toBe('Bearer');
  }
  const a = { ...unknown.body.error };
  const b = { ...wrong.body.error };
  delete a.request_id;
  delete b.request_id;
  expect(a).toEqual(b);
});
test('login rejects extra fields, invalid fields and queries', async () => {
  for (const body of [
    { email: users[0].email, password: 'x', role: 'national' },
    { email: 'bad', password: 'x' },
    { email: users[0].email },
    { email: users[0].email, password: '' },
  ]) {
    expectApiError(
      await request(app).post('/v1/auth/tokens').send(body),
      400,
      'VALIDATION_FAILED',
    );
  }
  expectApiError(
    await request(app)
      .post('/v1/auth/tokens?role=national')
      .send({ email: users[0].email, password: 'x' }),
    400,
    'INVALID_QUERY',
  );
});
test('bearer verification rejects missing, malformed, tampered, expired and invalid-claim tokens', async () => {
  const valid = fixture.tokens.signUserToken(users[0]);
  const claims = jwt.decode(valid);
  const signingSecret = 'isolated-test-only-signing-secret-at-least-32-bytes';
  const invalid = [
    ['', 'UNAUTHENTICATED'],
    ['Basic abc', 'UNAUTHENTICATED'],
    ['Bearer', 'UNAUTHENTICATED'],
    [`Bearer ${valid} extra`, 'UNAUTHENTICATED'],
    [`Bearer ${valid.slice(0, -8)}bad`, 'UNAUTHENTICATED'],
    [
      `Bearer ${jwt.sign({ ...claims, exp: 1 }, signingSecret, { algorithm: 'HS256' })}`,
      'TOKEN_EXPIRED',
    ],
    ...[{ iss: 'wrong' }, { aud: 'wrong' }, { typ: 'other' }].map((patch) => [
      `Bearer ${jwt.sign({ ...claims, ...patch }, signingSecret, { algorithm: 'HS256' })}`,
      'UNAUTHENTICATED',
    ]),
    [
      `Bearer ${jwt.sign(claims, null, { algorithm: 'none' })}`,
      'UNAUTHENTICATED',
    ],
  ];
  for (const [authorization, code] of invalid) {
    const res = await request(app)
      .get('/v1/users/me')
      .set('Authorization', authorization);
    expectApiError(res, 401, code);
    expect(res.headers['www-authenticate']).toBe('Bearer');
  }
});
test('device credentials cannot read user profiles', async () => {
  const token = fixture.tokens.signDeviceToken(
    fixture.dataset.installations[0],
  );
  expectApiError(
    await request(app)
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${token}`),
    403,
    'FORBIDDEN_SCOPE',
  );
});
test('password change and missing account revoke old tokens', async () => {
  const user = users[0];
  const token = bearer(user);
  try {
    await fixture.db.user.update({
      where: { user_id: user.user_id },
      data: { password_hash: await hashPassword('Changed#Password2026') },
    });
    expectApiError(
      await request(app).get('/v1/users/me').set('Authorization', token),
      401,
      'TOKEN_REVOKED',
    );
  } finally {
    await fixture.db.user.update({
      where: { user_id: user.user_id },
      data: { password_hash: user.password_hash },
    });
  }
  expectApiError(
    await request(app)
      .get('/v1/users/me')
      .set('Authorization', bearer({ ...user, user_id: 2147483647 })),
    401,
    'TOKEN_REVOKED',
  );
});
test('auth resource methods are exact and me query is strict', async () => {
  for (const [path, method, allow] of [
    ['/v1/auth/tokens', 'get', 'POST'],
    ['/v1/auth/tokens', 'put', 'POST'],
    ['/v1/users/me', 'head', 'GET, PATCH'],
    ['/v1/users/me', 'delete', 'GET, PATCH'],
  ]) {
    const agent = request(app);
    const res = await agent[method](path).set(
      'Content-Type',
      'application/json',
    );
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe(allow);
  }
  expectApiError(
    await request(app)
      .get('/v1/users/me?extra=1')
      .set('Authorization', bearer(users[0])),
    400,
    'INVALID_QUERY',
  );
});
