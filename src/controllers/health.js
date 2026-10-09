import { sendRepresentation } from '../utils/representation.js';

export function getHealth(_req, res) {
  sendRepresentation(res, { status: 'ok' });
}
