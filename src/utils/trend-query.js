import { parseTimestamp } from './read-time.js';
import { invalidQuery, parsePagination } from './pagination.js';
import { loadPaginationConfig } from '../config/data.js';
import { snapTrendWindow, enumerateBuckets } from './time.js';

export function parseTrendQuery(query) {
  for (const field of Object.keys(query))
    if (
      !['from', 'to', 'interval', 'sort', 'page', 'page_size'].includes(field)
    )
      throw invalidQuery('query', 'contains an unsupported parameter');
  const from = parseTimestamp(query.from, { field: 'from' });
  const to = parseTimestamp(query.to, { field: 'to' });
  if (from >= to) throw invalidQuery('from/to', 'from must precede to');
  const interval = query.interval ?? 'day';
  if (!['hour', 'day'].includes(interval))
    throw invalidQuery('interval', 'must be hour or day');
  const sort = query.sort ?? 'bucket_start';
  if (!['bucket_start', '-bucket_start'].includes(sort))
    throw invalidQuery('sort', 'must be bucket_start or -bucket_start');
  const effective = snapTrendWindow(from, to, interval);
  const cap = (interval === 'hour' ? 7 : 92) * 86400000;
  if (effective.to - effective.from > cap)
    throw invalidQuery(
      'from/to',
      `effective window must span at most ${interval === 'hour' ? 7 : 92} days`,
    );
  return {
    ...effective,
    interval,
    descending: sort.startsWith('-'),
    buckets: enumerateBuckets(effective.from, effective.to, interval),
    pagination: parsePagination(query, loadPaginationConfig()),
  };
}
