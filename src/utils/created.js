import { createHash } from 'node:crypto';
import { baseUrl } from './pagination.js';

export function createdReadingLocation(req, siteId, timestamp) {
  const url = baseUrl(req);
  url.pathname = `/v1/installations/${siteId}/readings/${encodeURIComponent(timestamp)}`;
  url.search = '';
  url.hash = '';
  return url.href;
}
export function sendCreated(res, body, location) {
  const payload = JSON.stringify(body);
  res
    .status(201)
    .type('application/json')
    .set({
      Location: location,
      ETag: `"${createHash('sha256').update(payload).digest('hex')}"`,
      'Cache-Control': 'no-store',
    })
    .end(payload);
}
