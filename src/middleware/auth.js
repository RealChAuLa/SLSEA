import { ApiError } from '../errors/api-error.js';
import { pwVersion } from '../utils/jwt.js';

export function authenticate({ getDb, tokens }) {
  return async (req, _res, next) => {
    try {
      const authorization = req.get('Authorization');
      const match =
        typeof authorization === 'string' &&
        /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(
          authorization,
        );
      if (!match)
        throw new ApiError(
          'UNAUTHENTICATED',
          401,
          'A valid bearer token is required.',
        );
      const claims = tokens.verifyToken(match[1]);
      if (claims.typ === 'device') {
        req.principal = {
          kind: 'device',
          site_id: claims.site_id,
          meter_id: claims.meter_id,
          scopes: claims.scope.split(' '),
        };
      } else {
        const db = await getDb();
        const user = await db.user.findUnique({
          where: { user_id: Number(claims.sub) },
        });
        if (!user || pwVersion(user.password_hash) !== claims.pv)
          throw new ApiError(
            'TOKEN_REVOKED',
            401,
            'The bearer token has been revoked.',
          );
        req.user = user;
        req.principal = {
          kind: 'user',
          user_id: user.user_id,
          jurisdiction_type: claims.jurisdiction_type,
          jurisdiction_id: claims.jurisdiction_id,
          scopes: claims.scope.split(' '),
        };
        if (claims.jurisdiction_type === 'district') {
          const district = await db.district.findUnique({
            where: { district_id: claims.jurisdiction_id },
            select: { province_id: true },
          });
          req.principal.parent_province_id = district?.province_id;
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
