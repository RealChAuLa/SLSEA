import { ZodError } from 'zod';
import { ApiError } from './api-error.js';

export function errorHandler(logger) {
  return (error, req, res, next) => {
    if (res.headersSent) return next(error);

    let failure = error;
    if (error instanceof ZodError) {
      failure = new ApiError(
        'VALIDATION_FAILED',
        400,
        'Request validation failed.',
        error.issues.map((issue) => ({
          field: issue.path.join('.') || 'query',
          issue: issue.message,
        })),
      );
    } else if (error.type === 'entity.parse.failed') {
      failure = new ApiError(
        'MALFORMED_JSON',
        400,
        'Request body must contain valid JSON.',
      );
    } else if (error.type === 'entity.too.large') {
      failure = new ApiError(
        'VALIDATION_FAILED',
        400,
        'Request body is too large.',
        [{ field: 'body', issue: 'must not exceed 10 kb' }],
      );
    } else if (
      ['charset.unsupported', 'encoding.unsupported'].includes(error.type)
    ) {
      failure = new ApiError(
        'UNSUPPORTED_MEDIA_TYPE',
        415,
        'JSON charset or content encoding is unsupported.',
      );
    } else if (
      ['request.aborted', 'request.size.invalid'].includes(error.type)
    ) {
      failure = new ApiError(
        'MALFORMED_JSON',
        400,
        'Request body could not be read.',
      );
    }

    if (!(failure instanceof ApiError)) {
      logger.error({
        event: 'unhandled_error',
        request_id: req.requestId,
        error,
      });
      failure = new ApiError(
        'INTERNAL_ERROR',
        500,
        'An unexpected server error occurred.',
      );
    }

    if (failure.status === 401) res.set('WWW-Authenticate', 'Bearer');
    res.status(failure.status).json({
      error: {
        code: failure.code,
        message: failure.message,
        status: failure.status,
        details: failure.details,
        request_id: req.requestId,
      },
    });
  };
}
