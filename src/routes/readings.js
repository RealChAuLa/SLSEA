import { methodNotAllowed } from '../middleware/method-not-allowed.js';
import { readingCollection, atomicReading } from '../services/readings.js';
import { sendConditional } from '../utils/conditional.js';
import { paginationLinkHeader } from '../utils/pagination.js';
import { baseUrl } from '../utils/pagination.js';
import { ingestReading } from '../services/ingestion.js';
import { createdReadingLocation, sendCreated } from '../utils/created.js';

export function registerReadingRoutes(app, { getDb, reads, writes, clock }) {
  for (const [path, root] of [
    ['/v1/installations/:siteId/readings', false],
    ['/v1/readings', true],
  ]) {
    const route = app
      .route(path)
      .all(methodNotAllowed(root ? ['GET'] : ['GET', 'POST']))
      .get(...reads, async (req, res) => {
        const { body, lastModified } = await readingCollection(
          await getDb(),
          req,
          { root, clock },
        );
        res.set('Link', paginationLinkHeader(body.links));
        sendConditional(req, res, body, { lastModified });
      });
    if (!root)
      route.post(...writes, async (req, res) => {
        // Validate the response origin before committing a write.
        baseUrl(req);
        const body = await ingestReading(await getDb(), req, { clock });
        sendCreated(
          res,
          body,
          createdReadingLocation(req, body.site_id, body.timestamp),
        );
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
