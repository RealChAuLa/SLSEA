import { z } from 'zod';
import { ApiError } from '../errors/api-error.js';
import { invalidQuery, queryInteger, parsePagination } from './pagination.js';
import { loadPaginationConfig } from '../config/data.js';
import { now } from './clock.js';

const iso = z.iso.datetime({ offset: true });
export function parseTimestamp(
  value,
  { field = 'timestamp', path = false } = {},
) {
  if (
    typeof value !== 'string' ||
    !iso.safeParse(value).success ||
    !Number.isFinite(Date.parse(value))
  ) {
    if (path)
      throw new ApiError(
        'VALIDATION_FAILED',
        400,
        'Path timestamp must be an ISO-8601 timestamp with a timezone.',
      );
    throw invalidQuery(
      field,
      'must be an ISO-8601 timestamp with Z or an encoded offset',
    );
  }
  return new Date(value);
}
export function parseHistoryQuery(query, { root = false, clock = now } = {}) {
  const filterFields = {
    province_id: 'province',
    district_id: 'district',
    substation_id: 'substation',
    site_id: 'installation',
  };
  const allowed = [
    'from',
    'to',
    'sort',
    'page',
    'page_size',
    ...(root ? Object.keys(filterFields) : []),
  ];
  for (const field of Object.keys(query))
    if (!allowed.includes(field))
      throw invalidQuery('query', 'contains an unsupported parameter');
  let from =
    query.from === undefined
      ? undefined
      : parseTimestamp(query.from, { field: 'from' });
  let to =
    query.to === undefined
      ? undefined
      : parseTimestamp(query.to, { field: 'to' });
  if (root) {
    to ??= clock();
    from ??= new Date(to.getTime() - 86400000);
  }
  if (from && to && (from >= to || (root && to - from > 31 * 86400000)))
    throw invalidQuery(
      'from/to',
      root
        ? 'must be ordered and span at most 31 days'
        : 'from must precede to',
    );
  const sort = query.sort ?? '-timestamp';
  if (typeof sort !== 'string' || !['timestamp', '-timestamp'].includes(sort))
    throw invalidQuery('sort', 'must be timestamp or -timestamp');
  const filters = Object.fromEntries(
    Object.keys(filterFields)
      .filter((key) => query[key] !== undefined)
      .map((key) => [
        key,
        { level: filterFields[key], id: queryInteger(query[key], key) },
      ]),
  );
  return {
    from,
    to,
    filters,
    orderBy: [
      { timestamp: sort === 'timestamp' ? 'asc' : 'desc' },
      { meter_id: 'asc' },
    ],
    pagination: parsePagination(query, loadPaginationConfig()),
  };
}
