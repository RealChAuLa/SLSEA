import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { sendConditional } from '../../src/utils/conditional.js';
import {
  parsePagination,
  collectionEnvelope,
} from '../../src/utils/pagination.js';
import { parseSort } from '../../src/utils/sort.js';
import { loadPaginationConfig } from '../../src/config/data.js';

const logger = { info: jest.fn(), error: jest.fn() };
const router = express.Router();
router.get('/conditional', (req, res) =>
  sendConditional(req, res, { value: 1 }),
);
const app = createApp({ logger, router });
test('conditional requests use strong If-Match, weak If-None-Match and RFC precedence', async () => {
  const res = await request(app).get('/conditional').expect(200);
  const etag = res.headers.etag;
  await request(app)
    .get('/conditional')
    .set('If-None-Match', `W/${etag}`)
    .expect(304)
    .expect('ETag', etag);
  await request(app)
    .get('/conditional')
    .set('If-Match', `W/${etag}`)
    .expect(412);
  await request(app)
    .get('/conditional')
    .set('If-Match', '"wrong"')
    .set('If-None-Match', etag)
    .expect(412);
  await request(app)
    .get('/conditional')
    .set('If-Match', `"wrong", ${etag}`)
    .set('If-None-Match', '"other"')
    .expect(200);
  await request(app).get('/conditional').set('If-Match', '*').expect(200);
  const unchanged = await request(app)
    .get('/conditional')
    .set('If-None-Match', '*')
    .expect(304);
  expect(unchanged.text).toBe('');
  expect(unchanged.headers['cache-control']).toBe('private, no-cache');
  expect(res.headers['last-modified']).toBeUndefined();
  await request(app)
    .get('/conditional')
    .set('If-Modified-Since', 'Wed, 01 Jan 2099 00:00:00 GMT')
    .expect(200);
});
test('pagination parses strict integers and prevents unsafe database offsets', () => {
  const config = { defaultPageSize: 50, maxPageSize: 500 };
  expect(parsePagination({}, config)).toEqual({
    page: 1,
    pageSize: 50,
    skip: 0,
  });
  for (const query of [
    { page: '0' },
    { page: '1.2' },
    { page: '2abc' },
    { page_size: '501' },
    { page_size: ['1', '2'] },
    { page: '2147483647', page_size: '500' },
  ])
    expect(() => parsePagination(query, config)).toThrow();
  expect(parseSort('-name', 'site_id')).toEqual([
    { name: 'desc' },
    { site_id: 'asc' },
  ]);
  expect(() => parseSort('password_hash', 'site_id')).toThrow();
});

test('pagination configuration validates defaults and maximums centrally', () => {
  const config = loadPaginationConfig({
    DEFAULT_PAGE_SIZE: '3',
    MAX_PAGE_SIZE: '5',
  });
  expect(parsePagination({}, config).pageSize).toBe(3);
  expect(() => parsePagination({ page_size: '6' }, config)).toThrow();
  for (const env of [
    { DEFAULT_PAGE_SIZE: '6', MAX_PAGE_SIZE: '5' },
    { MAX_PAGE_SIZE: '501' },
    { DEFAULT_PAGE_SIZE: '0' },
  ]) {
    expect(() => loadPaginationConfig(env)).toThrow(
      /Invalid environment configuration/,
    );
  }
});
test('empty and out-of-range pagination produces valid links without widening filters', () => {
  const req = {
    protocol: 'https',
    originalUrl: '/v1/installations?district_id=1',
    get: (name) =>
      name === 'X-Forwarded-Host'
        ? 'api.example.test'
        : 'internal.example.test',
  };
  const body = collectionEnvelope(req, [], 0, { page: 1, pageSize: 5 });
  expect(body.pagination).toEqual({
    page: 1,
    page_size: 5,
    total_count: 0,
    total_pages: 0,
  });
  expect(body.links.prev).toBeNull();
  expect(body.links.next).toBeNull();
  expect(body.links.first).toBe(
    'https://api.example.test/v1/installations?district_id=1&page=1&page_size=5',
  );
  expect(body.links.last).toBe(body.links.first);
  const beyond = collectionEnvelope(req, [], 12, { page: 9, pageSize: 5 });
  expect(beyond.links.next).toBeNull();
  expect(beyond.links.prev).toContain('page=3&');
});
