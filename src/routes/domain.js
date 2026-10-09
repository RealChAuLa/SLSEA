import { authenticate } from '../middleware/auth.js';
import { requireScope, requireUserToken } from '../middleware/scopes.js';
import { methodNotAllowed } from '../middleware/method-not-allowed.js';
import { issueToken } from '../services/auth.js';
import { serialize } from '../serializers/index.js';
import { signUserToken, verifyToken } from '../utils/jwt.js';
import { sendRepresentation } from '../utils/representation.js';
import { ApiError } from '../errors/api-error.js';
import { getAtomic, getCollection } from '../services/hierarchy-read.js';
import { sendConditional } from '../utils/conditional.js';
import { paginationLinkHeader } from '../utils/pagination.js';
import { registerReadingRoutes } from './readings.js';

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
  { db, tokens = { signUserToken, verifyToken }, clock } = {},
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

  const reads = [auth, requireUserToken, requireScope('generation:read')];
  const collection = (path, resource, options = {}) => {
    app
      .route(path)
      .all(methodNotAllowed(['GET']))
      .get(...reads, async (req, res) => {
        const body = await getCollection(await getDb(), req, resource, options);
        res.set('Link', paginationLinkHeader(body.links));
        sendConditional(req, res, body);
      });
  };
  const atomic = (path, resource, param) => {
    app
      .route(path)
      .all(methodNotAllowed(['GET']))
      .get(...reads, emptyDomainQuery, async (req, res) => {
        const body = await getAtomic(
          await getDb(),
          req.principal,
          resource,
          req.params[param],
        );
        sendConditional(req, res, body);
      });
  };
  collection('/v1/provinces', 'province');
  atomic('/v1/provinces/:provinceId', 'province', 'provinceId');
  collection('/v1/provinces/:provinceId/districts', 'district', {
    parent: { level: 'province', param: 'provinceId' },
  });
  atomic('/v1/districts/:districtId', 'district', 'districtId');
  collection('/v1/districts/:districtId/grid-substations', 'substation', {
    parent: { level: 'district', param: 'districtId' },
  });
  atomic('/v1/grid-substations/:substationId', 'substation', 'substationId');
  collection(
    '/v1/grid-substations/:substationId/installations',
    'installation',
    { parent: { level: 'substation', param: 'substationId' } },
  );
  collection('/v1/installations', 'installation', { allowFilters: true });
  atomic('/v1/installations/:siteId', 'installation', 'siteId');
  registerReadingRoutes(app, { getDb, reads, clock });
}
