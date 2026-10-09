import { ApiError } from '../errors/api-error.js';
const forbidden = () =>
  new ApiError(
    'FORBIDDEN_SCOPE',
    403,
    'The token does not grant access to this operation.',
  );
export function requireScope(scope) {
  return (req, _res, next) =>
    next(req.principal?.scopes?.includes(scope) ? undefined : forbidden());
}
export function requireUserToken(req, _res, next) {
  next(req.principal?.kind === 'user' ? undefined : forbidden());
}
export function requireDeviceToken(req, _res, next) {
  next(req.principal?.kind === 'device' ? undefined : forbidden());
}
