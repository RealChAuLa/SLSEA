import { invalidQuery } from './pagination.js';

export function parseSort(value, primaryKey) {
  if (value === undefined) return [{ [primaryKey]: 'asc' }];
  if (typeof value !== 'string' || !['name', '-name'].includes(value))
    throw invalidQuery('sort', 'must be name or -name');
  return [
    { name: value.startsWith('-') ? 'desc' : 'asc' },
    { [primaryKey]: 'asc' },
  ];
}
