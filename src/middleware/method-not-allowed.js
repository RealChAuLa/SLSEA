import { ApiError } from '../errors/api-error.js';

export function methodNotAllowed(allowedMethods) {
  const methods = allowedMethods.map((method) => method.toUpperCase());
  return (req, res, next) => {
    if (methods.includes(req.method)) return next();
    res.set('Allow', methods.join(', '));
    next(
      new ApiError(
        'METHOD_NOT_ALLOWED',
        405,
        'The method is not supported on this resource.',
      ),
    );
  };
}
