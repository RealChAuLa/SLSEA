import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

export function requestContext(logger) {
  return (req, res, next) => {
    req.requestId = randomUUID();
    res.set('X-Request-Id', req.requestId);
    const started = performance.now();
    res.on('finish', () => {
      logger.info({
        event: 'request',
        request_id: req.requestId,
        method: req.method,
        path: req.route?.path ?? '[unmatched]',
        status: res.statusCode,
        duration_ms: Math.round((performance.now() - started) * 100) / 100,
      });
    });
    next();
  };
}
