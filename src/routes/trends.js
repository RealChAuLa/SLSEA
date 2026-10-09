import { methodNotAllowed } from '../middleware/method-not-allowed.js';
import { generationTrend } from '../services/trends.js';
import { sendConditional } from '../utils/conditional.js';
import { paginationLinkHeader } from '../utils/pagination.js';

export function registerTrendRoutes(app, { getDb, reads }) {
  for (const [path, type, param] of [
    ['/v1/generation-trend'],
    ['/v1/provinces/:provinceId/generation-trend', 'province', 'provinceId'],
    ['/v1/districts/:districtId/generation-trend', 'district', 'districtId'],
    [
      '/v1/grid-substations/:substationId/generation-trend',
      'substation',
      'substationId',
    ],
    ['/v1/installations/:siteId/generation-trend', 'installation', 'siteId'],
  ])
    app
      .route(path)
      .all(methodNotAllowed(['GET']))
      .get(...reads, async (req, res) => {
        const body = await generationTrend(await getDb(), req, { type, param });
        res.set('Link', paginationLinkHeader(body.links));
        sendConditional(req, res, body);
      });
}
