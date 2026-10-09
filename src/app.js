import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config as defaultConfig } from './config/index.js';
import { logger as defaultLogger } from './utils/logger.js';
import { requestContext } from './middleware/request-context.js';
import { negotiation } from './middleware/negotiation.js';
import { ApiError } from './errors/api-error.js';
import { errorHandler } from './errors/handler.js';
import { registerPublicRoutes } from './routes/public.js';
import { registerDomainRoutes } from './routes/domain.js';
import { bootstrapCspHash } from './controllers/docs.js';

export function createApp({
  config = defaultConfig,
  logger = defaultLogger,
  router,
  db,
  tokens,
  clock,
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('case sensitive routing', true);
  app.set('trust proxy', 1);
  app.use(requestContext(logger));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'script-src': [
            "'self'",
            'https://cdn.jsdelivr.net',
            bootstrapCspHash,
          ],
          'style-src': [
            "'self'",
            "'unsafe-inline'",
            'https://cdn.jsdelivr.net',
          ],
          'upgrade-insecure-requests':
            config.nodeEnv === 'production' ? [] : null,
        },
      },
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) =>
        callback(null, Boolean(origin && config.corsOrigins.includes(origin))),
      methods: ['GET', 'POST', 'PATCH'],
      allowedHeaders: [
        'Accept',
        'Authorization',
        'Content-Type',
        'If-Match',
        'If-None-Match',
        'If-Modified-Since',
        'X-Request-Id',
      ],
      exposedHeaders: [
        'X-Request-Id',
        'ETag',
        'Last-Modified',
        'Link',
        'Location',
        'Allow',
        'WWW-Authenticate',
      ],
    }),
  );
  app.use((req, res, next) => {
    if (req.method === 'GET') res.vary('Accept').vary('Authorization');
    next();
  });
  app.use(negotiation);
  app.use(
    express.json({
      limit: '10kb',
      type: 'application/json',
      strict: true,
      inflate: false,
    }),
  );
  registerPublicRoutes(app);
  registerDomainRoutes(app, { db, tokens, clock });
  if (router) app.use(router);
  app.use((_req, _res, next) =>
    next(
      new ApiError('NOT_FOUND', 404, 'The requested resource was not found.'),
    ),
  );
  app.use(errorHandler(logger));
  return app;
}

export default createApp();
