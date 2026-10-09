import { ApiError } from '../errors/api-error.js';

export function invalidQuery(field, issue = 'is invalid') {
  return new ApiError('INVALID_QUERY', 400, 'Query parameters are invalid.', [
    { field, issue },
  ]);
}
export function queryInteger(value, field, max = 2147483647) {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value) ||
    Number(value) > max
  )
    throw invalidQuery(
      field,
      'must be a positive integer within the supported range',
    );
  return Number(value);
}
export function parsePagination(
  query,
  { defaultPageSize = 50, maxPageSize = 500 } = {},
) {
  const page = query.page === undefined ? 1 : queryInteger(query.page, 'page');
  const pageSize =
    query.page_size === undefined
      ? defaultPageSize
      : queryInteger(query.page_size, 'page_size', maxPageSize);
  const skip = (page - 1) * pageSize;
  if (!Number.isSafeInteger(skip) || skip > 2147483647)
    throw invalidQuery('page', 'offset exceeds the supported range');
  return { page, pageSize, skip };
}
export function baseUrl(req) {
  const host = (req.get('X-Forwarded-Host') || req.get('Host') || '')
    .split(',')[0]
    .trim();
  const protocol = req.protocol;
  if (
    !['http', 'https'].includes(protocol) ||
    !host ||
    /[\s/@?#\\]/.test(host) ||
    !req.originalUrl.startsWith('/') ||
    req.originalUrl.startsWith('//')
  )
    throw invalidQuery('origin', 'request origin is invalid');
  try {
    return new URL(req.originalUrl, `${protocol}://${host}`);
  } catch {
    throw invalidQuery('origin', 'request origin is invalid');
  }
}
export function collectionEnvelope(req, data, totalCount, { page, pageSize }) {
  const totalPages = Math.ceil(totalCount / pageSize);
  const lastPage = Math.max(1, totalPages);
  const url = baseUrl(req);
  const link = (number) => {
    const result = new URL(url);
    result.searchParams.set('page', String(number));
    result.searchParams.set('page_size', String(pageSize));
    return result.href;
  };
  return {
    data,
    pagination: {
      page,
      page_size: pageSize,
      total_count: totalCount,
      total_pages: totalPages,
    },
    links: {
      self: link(page),
      first: link(1),
      prev:
        page > 1 && totalCount > 0 ? link(Math.min(page - 1, lastPage)) : null,
      next: page < totalPages ? link(page + 1) : null,
      last: link(lastPage),
    },
  };
}
export function paginationLinkHeader(links) {
  return ['first', 'prev', 'next', 'last']
    .filter((key) => links[key] !== null)
    .map((key) => `<${links[key]}>; rel="${key}"`)
    .join(', ');
}
