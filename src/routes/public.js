import { getHealth } from '../controllers/health.js';
import { getDocs, getOpenApi } from '../controllers/docs.js';
import { methodNotAllowed } from '../middleware/method-not-allowed.js';
import { validateEmptyQuery } from '../middleware/validate-empty-query.js';

export function registerPublicRoutes(app) {
  app
    .route('/health')
    .all(methodNotAllowed(['GET']))
    .get(validateEmptyQuery, getHealth);
  app
    .route('/docs')
    .all(methodNotAllowed(['GET']))
    .get(validateEmptyQuery, getDocs);
  app
    .route('/openapi.json')
    .all(methodNotAllowed(['GET']))
    .get(validateEmptyQuery, getOpenApi);
}
