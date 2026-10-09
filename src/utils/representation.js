import { sendConditional } from './conditional.js';

export function sendRepresentation(res, body, type = 'application/json') {
  return sendConditional(res.req, res, body, { type, privateCache: false });
}
