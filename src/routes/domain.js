import { authenticate } from '../middleware/auth.js';
import { requireScope, requireUserToken } from '../middleware/scopes.js';
import { methodNotAllowed } from '../middleware/method-not-allowed.js';
import { issueToken } from '../services/auth.js';
import { serialize } from '../serializers/index.js';
import { signUserToken, verifyToken } from '../utils/jwt.js';
import { sendRepresentation } from '../utils/representation.js';
import { ApiError } from '../errors/api-error.js';

function emptyDomainQuery(req, _res, next) {
  if (Object.keys(req.query).length) {
    return next(
      new ApiError(
        'INVALID_QUERY',
        400,
        'Query parameters are not supported on this resource.',
      ),
    );
  }
  next();
}

export function registerDomainRoutes(
  app,
  { db, tokens = { signUserToken, verifyToken } } = {},
) {
  const getDb = async () => db ?? (await import('../db.js')).db;
  const auth = authenticate({ getDb, tokens });
  app
    .route('/v1/auth/tokens')
    .all(methodNotAllowed(['POST']))
    .post(emptyDomainQuery, async (req, res) => {
      const result = await issueToken(await getDb(), tokens, req.body);
      res.set('Cache-Control', 'no-store').json(result);
    });
  app
    .route('/v1/users/me')
    .all(methodNotAllowed(['GET']))
    .get(
      auth,
      requireUserToken,
      requireScope('account:manage'),
      emptyDomainQuery,
      (req, res) => {
        res.set('Cache-Control', 'private, no-cache');
        sendRepresentation(res, serialize('user', req.user));
      },
    );
}
