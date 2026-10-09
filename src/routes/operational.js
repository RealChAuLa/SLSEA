import { methodNotAllowed } from '../middleware/method-not-allowed.js';
import { lastKnown, overview } from '../services/operational.js';
import { sendConditional } from '../utils/conditional.js';

export function registerOperationalRoutes(app, { getDb, reads, clock }) {
  app
    .route('/v1/installations/:siteId/last-known-reading')
    .all(methodNotAllowed(['GET']))
    .get(...reads, async (req, res) => {
      const { body, lastModified } = await lastKnown(await getDb(), req, {
        clock,
      });
      sendConditional(req, res, body, { lastModified });
    });
  app
    .route('/v1/installations/:siteId/overview')
    .all(methodNotAllowed(['GET']))
    .get(...reads, async (req, res) => {
      const body = await overview(await getDb(), req, { clock });
      sendConditional(req, res, body);
    });
}
