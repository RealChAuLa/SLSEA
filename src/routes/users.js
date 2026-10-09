import { methodNotAllowed } from '../middleware/method-not-allowed.js';
import { listUsers, getUser, changePassword } from '../services/users.js';
import { sendConditional } from '../utils/conditional.js';
import { paginationLinkHeader } from '../utils/pagination.js';

export function registerUserRoutes(app, { getDb, accounts }) {
  app
    .route('/v1/users')
    .all(methodNotAllowed(['GET']))
    .get(...accounts, async (req, res) => {
      const body = await listUsers(await getDb(), req);
      res.set('Link', paginationLinkHeader(body.links));
      sendConditional(req, res, body);
    });
  // Literal /me must precede the parameter route.
  for (const [path, self] of [
    ['/v1/users/me', true],
    ['/v1/users/:userId', false],
  ])
    app
      .route(path)
      .all(methodNotAllowed(['GET', 'PATCH']))
      .get(...accounts, async (req, res) => {
        sendConditional(req, res, await getUser(await getDb(), req, { self }));
      })
      .patch(...accounts, async (req, res) => {
        await changePassword(await getDb(), req, { self });
        res.set('Cache-Control', 'no-store').status(204).end();
      });
}
