import { methodNotAllowed } from '../middleware/method-not-allowed.js';
import { generationSummary } from '../services/regions.js';
import { sendConditional } from '../utils/conditional.js';

export function registerRegionRoutes(app, { getDb, reads, clock }) {
  for (const [path, type, param] of [
    ['/v1/generation-summary'],
    ['/v1/provinces/:provinceId/generation-summary', 'province', 'provinceId'],
    ['/v1/districts/:districtId/generation-summary', 'district', 'districtId'],
    [
      '/v1/grid-substations/:substationId/generation-summary',
      'substation',
      'substationId',
    ],
  ])
    app
      .route(path)
      .all(methodNotAllowed(['GET']))
      .get(...reads, async (req, res) => {
        const body = await generationSummary(await getDb(), req, {
          type,
          param,
          clock,
        });
        sendConditional(req, res, body, { lastModified: body.as_of });
      });
}
