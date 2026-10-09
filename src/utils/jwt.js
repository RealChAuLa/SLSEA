import { createHash } from 'node:crypto';
import jsonwebtoken from 'jsonwebtoken';
import { z } from 'zod';
import { loadTokenConfig } from '../config/data.js';
import { ApiError } from '../errors/api-error.js';
import { now } from './clock.js';

const positiveId = z.number().int().positive().max(2147483647);
const common = {
  iss: z.string().min(1),
  aud: z.string().min(1),
  sub: z.string().regex(/^[1-9]\d*$/),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
};
const deviceClaims = z
  .object({
    ...common,
    typ: z.literal('device'),
    site_id: positiveId,
    meter_id: z.string().min(1),
    scope: z.literal('readings:write'),
  })
  .strict();
const userClaims = z
  .object({
    ...common,
    typ: z.literal('user'),
    jurisdiction_type: z.enum(['national', 'provincial', 'district']),
    jurisdiction_id: positiveId.nullable(),
    scope: z.literal('generation:read account:manage'),
    pv: z.string().regex(/^[a-f0-9]{16}$/),
  })
  .strict();
const claimsSchema = z
  .discriminatedUnion('typ', [deviceClaims, userClaims])
  .superRefine((claims, context) => {
    const validId = positiveId.safeParse(Number(claims.sub)).success;
    const validSubject =
      claims.typ !== 'device' || claims.sub === String(claims.site_id);
    const validJurisdiction =
      claims.typ !== 'user' ||
      (claims.jurisdiction_type === 'national'
        ? claims.jurisdiction_id === null
        : claims.jurisdiction_id !== null);
    if (
      !validId ||
      !validSubject ||
      !validJurisdiction ||
      claims.exp <= claims.iat
    )
      context.addIssue({ code: 'custom', message: 'Invalid token claims.' });
  });

export function pwVersion(passwordHash) {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
}

export function createTokenUtils(settings, { clock = now } = {}) {
  const {
    jwtSecret,
    jwtIssuer,
    jwtAudience,
    userTokenTtlSeconds,
    deviceTokenTtlDays,
  } = loadTokenConfig({
    JWT_SECRET: settings.jwtSecret,
    JWT_ISSUER: settings.jwtIssuer,
    JWT_AUDIENCE: settings.jwtAudience,
    USER_TOKEN_TTL_SECONDS: settings.userTokenTtlSeconds,
    DEVICE_TOKEN_TTL_DAYS: settings.deviceTokenTtlDays,
  });

  function sign(payload, ttlSeconds) {
    const iat = Math.floor(clock().getTime() / 1000);
    const claims = claimsSchema.parse({
      ...payload,
      iss: jwtIssuer,
      aud: jwtAudience,
      iat,
      exp: iat + ttlSeconds,
    });
    return jsonwebtoken.sign(claims, jwtSecret, { algorithm: 'HS256' });
  }

  return Object.freeze({
    issuer: jwtIssuer,
    audience: jwtAudience,
    signUserToken(user) {
      return sign(
        {
          typ: 'user',
          sub: String(user.user_id),
          jurisdiction_type: user.jurisdiction_type,
          jurisdiction_id: user.jurisdiction_id,
          scope: 'generation:read account:manage',
          pv: pwVersion(user.password_hash),
        },
        userTokenTtlSeconds,
      );
    },
    signDeviceToken(installation) {
      return sign(
        {
          typ: 'device',
          sub: String(installation.site_id),
          site_id: installation.site_id,
          meter_id: installation.meter_id,
          scope: 'readings:write',
        },
        deviceTokenTtlDays * 86400,
      );
    },
    verifyToken(token) {
      try {
        const claims = jsonwebtoken.verify(token, jwtSecret, {
          algorithms: ['HS256'],
          issuer: jwtIssuer,
          audience: jwtAudience,
          clockTimestamp: Math.floor(clock().getTime() / 1000),
        });
        return claimsSchema.parse(claims);
      } catch (error) {
        if (error instanceof jsonwebtoken.TokenExpiredError)
          throw new ApiError(
            'TOKEN_EXPIRED',
            401,
            'The bearer token has expired.',
          );
        throw new ApiError(
          'UNAUTHENTICATED',
          401,
          'The bearer token is invalid.',
        );
      }
    },
  });
}

let runtimeTokens;
function tokenUtils() {
  runtimeTokens ??= createTokenUtils(loadTokenConfig());
  return runtimeTokens;
}

export function signUserToken(user) {
  return tokenUtils().signUserToken(user);
}
export function signDeviceToken(installation) {
  return tokenUtils().signDeviceToken(installation);
}
export function verifyToken(token) {
  return tokenUtils().verifyToken(token);
}
