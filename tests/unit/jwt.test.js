import jsonwebtoken from 'jsonwebtoken';
import { createTokenUtils, pwVersion } from '../../src/utils/jwt.js';

const fixedNow = new Date('2026-10-09T00:00:00.000Z');
const settings = {
  jwtSecret: 'unit-test-only-signing-key-32-bytes-minimum',
  jwtIssuer: 'slsea-solar-api',
  jwtAudience: 'slsea-solar-api',
  userTokenTtlSeconds: 3600,
  deviceTokenTtlDays: 365,
};
const tokens = createTokenUtils(settings, { clock: () => fixedNow });
const user = {
  user_id: 5,
  jurisdiction_type: 'district',
  jurisdiction_id: 1,
  password_hash: 'test-hash-never-a-token-claim',
  name: 'Ignored Name',
  email: 'ignored@example.test',
};
const site = { site_id: 1, meter_id: 'MTR-0001', name: 'Ignored site' };

test('user and device tokens contain exactly their whitelisted claims', () => {
  const userClaims = tokens.verifyToken(tokens.signUserToken(user));
  expect(userClaims).toEqual({
    typ: 'user',
    sub: '5',
    jurisdiction_type: 'district',
    jurisdiction_id: 1,
    scope: 'generation:read account:manage',
    pv: pwVersion(user.password_hash),
    iss: settings.jwtIssuer,
    aud: settings.jwtAudience,
    iat: Math.floor(fixedNow.getTime() / 1000),
    exp: Math.floor(fixedNow.getTime() / 1000) + 3600,
  });
  const deviceClaims = tokens.verifyToken(tokens.signDeviceToken(site));
  expect(deviceClaims).toEqual({
    typ: 'device',
    sub: '1',
    site_id: 1,
    meter_id: 'MTR-0001',
    scope: 'readings:write',
    iss: settings.jwtIssuer,
    aud: settings.jwtAudience,
    iat: Math.floor(fixedNow.getTime() / 1000),
    exp: Math.floor(fixedNow.getTime() / 1000) + 365 * 86400,
  });
  expect(
    jsonwebtoken.decode(tokens.signDeviceToken(site), { complete: true }).header
      .alg,
  ).toBe('HS256');
});

test('password versions are stable and change with the stored hash', () => {
  expect(pwVersion('abc')).toBe('ba7816bf8f01cfea');
  expect(pwVersion('abc')).not.toBe(pwVersion('abcd'));
});

test.each([
  'secret',
  'issuer',
  'audience',
  'algorithm',
  'none',
  'type',
  'expiration',
  'subject',
  'scope',
  'extra-claim',
])('invalid %s is rejected', (fault) => {
  const payload = tokens.verifyToken(tokens.signDeviceToken(site));
  let secret = settings.jwtSecret;
  let algorithm = 'HS256';
  if (fault === 'secret') secret = 'different-unit-test-only-signing-secret';
  if (fault === 'issuer') payload.iss = 'other-issuer';
  if (fault === 'audience') payload.aud = 'other-audience';
  if (fault === 'algorithm') algorithm = 'HS384';
  if (fault === 'none') {
    algorithm = 'none';
    secret = '';
  }
  if (fault === 'type') payload.typ = 'admin';
  if (fault === 'expiration') delete payload.exp;
  if (fault === 'subject') payload.sub = '2';
  if (fault === 'scope') payload.scope = 'generation:read';
  if (fault === 'extra-claim') payload.password_hash = 'must-not-be-accepted';
  const token = jsonwebtoken.sign(payload, secret, { algorithm });
  expect(() => tokens.verifyToken(token)).toThrow(
    expect.objectContaining({ code: 'UNAUTHENTICATED', status: 401 }),
  );
});

test('expired tokens return TOKEN_EXPIRED with the injectable UTC clock', () => {
  const token = tokens.signUserToken(user);
  const later = createTokenUtils(settings, {
    clock: () => new Date(fixedNow.getTime() + 3600000),
  });
  expect(() => later.verifyToken(token)).toThrow(
    expect.objectContaining({ code: 'TOKEN_EXPIRED', status: 401 }),
  );
});

test('invalid national jurisdiction and missing pv are rejected even with a valid signature', () => {
  const payload = tokens.verifyToken(tokens.signUserToken(user));
  payload.jurisdiction_type = 'national';
  const token = jsonwebtoken.sign(payload, settings.jwtSecret, {
    algorithm: 'HS256',
  });
  expect(() => tokens.verifyToken(token)).toThrow();
  payload.jurisdiction_type = 'district';
  delete payload.pv;
  expect(() =>
    tokens.verifyToken(jsonwebtoken.sign(payload, settings.jwtSecret)),
  ).toThrow();
});
