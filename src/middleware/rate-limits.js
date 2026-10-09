import { rateLimit } from 'express-rate-limit';
import { isIP } from 'node:net';
import { ApiError } from '../errors/api-error.js';

export function requestLimits(enabled) {
  if (!enabled) return (_req, _res, next) => next();
  const create = (limit, windowMs, identifier) =>
    rateLimit({
      limit,
      windowMs,
      identifier,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      ipv6Subnet: 56,
      handler: (_req, res, next) => {
        res.set('Cache-Control', 'no-store');
        next(
          new ApiError(
            'RATE_LIMITED',
            429,
            'Too many requests. Retry after the indicated delay.',
          ),
        );
      },
    });
  const global = create(600, 60000, 'global');
  const login = create(30, 900000, 'login');
  const password = create(10, 900000, 'password');
  return (req, res, next) => {
    // Library validation diagnostics embed invalid IP input in console output.
    // Reject it before those diagnostics can bypass the sanitized logger.
    if (!isIP(req.ip ?? ''))
      return next(
        new ApiError('INVALID_QUERY', 400, 'Client address is invalid.'),
      );
    global(req, res, (error) => {
      if (error) return next(error);
      if (req.method === 'POST' && /^\/v1\/auth\/tokens\/?$/.test(req.path))
        return login(req, res, next);
      if (req.method === 'PATCH' && /^\/v1\/users\/[^/]+\/?$/.test(req.path))
        return password(req, res, next);
      next();
    });
  };
}
