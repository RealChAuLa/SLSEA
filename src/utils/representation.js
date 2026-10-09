import { createHash } from 'node:crypto';

// I0 emits representation hashes. Authorization-aware conditional evaluation
// belongs to I3; res.end avoids Express's implicit conditional response logic.
export function sendRepresentation(res, body, type = 'application/json') {
  const payload = type === 'application/json' ? JSON.stringify(body) : body;
  const etag = createHash('sha256').update(payload).digest('hex');
  res.status(200).type(type).set('ETag', `"${etag}"`).end(payload);
}
