import { methodNotAllowed } from '../middleware/method-not-allowed.js';
import { readingCollection, atomicReading } from '../services/readings.js';
import { sendConditional } from '../utils/conditional.js';
import { paginationLinkHeader } from '../utils/pagination.js';

export function registerReadingRoutes(app, { getDb, reads, clock }) {
  for (const [path, root] of [
    ['/v1/installations/:siteId/readings', false],
    ['/v1/readings', true],
  ]) {
    app
      .route(path)
      .all(methodNotAllowed(['GET']))
      .get(...reads, async (req, res) => {
        const { body, lastModified } = await readingCollection(
          await getDb(),
          req,
          { root, clock },
        );
        res.set('Link', paginationLinkHeader(body.links));
        sendConditional(req, res, body, { lastModified });
      });
  }
  app
    .route('/v1/installations/:siteId/readings/:timestamp')
    .all(methodNotAllowed(['GET']))
    .get(...reads, async (req, res) => {
      const { body, lastModified } = await atomicReading(await getDb(), req);
      sendConditional(req, res, body, { lastModified });
    });
}
