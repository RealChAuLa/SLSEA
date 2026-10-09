import { createHash } from 'node:crypto';
import { ApiError } from '../errors/api-error.js';

function matches(value, etag, { weak = false } = {}) {
  if (value.trim() === '*') return true;
  // Parse quoted opaque tags rather than splitting commas within a tag.
  const tokens = [];
  let remaining = value.trim();
  while (remaining) {
    const match = /^(W\/)?("[\x21\x23-\x7e\x80-\xff]*")\s*(?:,\s*|$)/.exec(
      remaining,
    );
    if (!match) return false;
    tokens.push({ weak: Boolean(match[1]), tag: match[2] });
    remaining = remaining.slice(match[0].length);
  }
  return tokens.some((token) => (weak || !token.weak) && token.tag === etag);
}

function parseHttpDate(value) {
  // HTTP-date permits IMF-fixdate and the two obsolete forms. ISO timestamps
  // and numeric strings are not valid If-Modified-Since values.
  const syntax =
    /^(?:[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT|[A-Za-z]+, \d{2}-[A-Za-z]{3}-\d{2} \d{2}:\d{2}:\d{2} GMT|[A-Za-z]{3} [A-Za-z]{3} [ \d]\d \d{2}:\d{2}:\d{2} \d{4})$/;
  return syntax.test(value) ? Date.parse(value) : NaN;
}

// Call only after authentication, scope checks, validation and authorization.
export function sendConditional(
  req,
  res,
  body,
  { lastModified, type = 'application/json', privateCache = true } = {},
) {
  const payload = type === 'application/json' ? JSON.stringify(body) : body;
  const etag = `"${createHash('sha256').update(payload).digest('hex')}"`;
  res.type(type).set('ETag', etag).vary('Accept').vary('Authorization');
  if (privateCache) res.set('Cache-Control', 'private, no-cache');
  if (lastModified)
    res.set('Last-Modified', new Date(lastModified).toUTCString());
  const ifMatch = req.get('If-Match');
  if (ifMatch !== undefined && !matches(ifMatch, etag))
    throw new ApiError(
      'PRECONDITION_FAILED',
      412,
      'The representation does not match the supplied precondition.',
    );
  const ifNoneMatch = req.get('If-None-Match');
  if (ifNoneMatch !== undefined && matches(ifNoneMatch, etag, { weak: true })) {
    res.removeHeader('Content-Type');
    return res.status(304).end();
  }
  const since = req.get('If-Modified-Since');
  if (ifNoneMatch === undefined && lastModified && since !== undefined) {
    const date = parseHttpDate(since);
    if (
      Number.isFinite(date) &&
      Math.floor(new Date(lastModified).getTime() / 1000) * 1000 <= date
    ) {
      res.removeHeader('Content-Type');
      return res.status(304).end();
    }
  }
  // Express res.send/json performs its own freshness handling. End explicitly
  // so only these ordered, authorization-aware conditions determine the status.
  return res.status(200).end(payload);
}
