import { ApiError } from '../errors/api-error.js';

const publicPaths = new Set(['/health', '/docs', '/openapi.json']);

export function negotiation(req, _res, next) {
  const path = req.path.length > 1 ? req.path.replace(/\/$/, '') : req.path;
  const representation = path === '/docs' ? 'text/html' : 'application/json';
  if (!req.accepts(representation)) {
    return next(
      new ApiError(
        'NOT_ACCEPTABLE',
        406,
        `Accept must permit ${representation}.`,
      ),
    );
  }
  if (['POST', 'PATCH'].includes(req.method) && !publicPaths.has(path)) {
    // Check the header directly: req.is() returns null when no body is present.
    const contentType = req
      .get('Content-Type')
      ?.split(';')[0]
      .trim()
      .toLowerCase();
    if (contentType !== 'application/json') {
      return next(
        new ApiError(
          'UNSUPPORTED_MEDIA_TYPE',
          415,
          'Content-Type must be application/json.',
        ),
      );
    }
  }
  next();
}
