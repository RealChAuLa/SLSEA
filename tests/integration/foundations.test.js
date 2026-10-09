import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import app, { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';
import { ApiError } from '../../src/errors/api-error.js';
import { methodNotAllowed } from '../../src/middleware/method-not-allowed.js';
import { createLogger } from '../../src/utils/logger.js';
import { expectApiError } from '../helpers/expect-api-error.js';

const logger = { info: jest.fn(), error: jest.fn() };
const testApp = createApp({ config: loadConfig({ NODE_ENV: 'test' }), logger });
const publicPaths = ['/health', '/docs', '/openapi.json'];

test('health is public and has the required JSON and security headers', async () => {
  const res = await request(testApp).get('/health').expect(200);
  expect(res.body).toEqual({ status: 'ok' });
  expect(res.headers['x-request-id']).toMatch(/^[\da-f-]{36}$/i);
  expect(res.headers['x-powered-by']).toBeUndefined();
  expect(res.headers['strict-transport-security']).toBeDefined();
  expect(res.headers['x-content-type-options']).toBe('nosniff');
  expect(res.headers.etag).toMatch(/^"[\da-f]{64}"$/);
  expect(res.headers.vary).toContain('Accept');
  expect(res.headers.vary).toContain('Authorization');
  expect(res.headers['last-modified']).toBeUndefined();
});

test('unknown routes use the shared error contract and domain endpoints do not exist', async () => {
  for (const path of ['/missing', '/v1/provinces', '/v1/users/me']) {
    expectApiError(await request(testApp).get(path), 404, 'NOT_FOUND');
  }
  expectApiError(
    await request(testApp).post('/v1/auth/tokens').send({}),
    404,
    'NOT_FOUND',
  );
});

test.each(publicPaths)(
  'known path %s rejects unsupported methods and emits Allow',
  async (path) => {
    for (const method of ['post', 'patch', 'put', 'delete', 'options']) {
      const res = await request(testApp)[method](path);
      expectApiError(res, 405, 'METHOD_NOT_ALLOWED');
      expect(res.headers.allow).toBe('GET');
    }
    // Register the method guard before GET so Express cannot implicitly accept HEAD.
    const res = await request(testApp).head(path).expect(405);
    expect(res.headers.allow).toBe('GET');
    expect(res.text).toBeUndefined();
  },
);

test.each(['text/html', 'application/xml', 'application/json;q=0', '*/*;q=0'])(
  'unacceptable Accept %s returns 406',
  async (accept) => {
    expectApiError(
      await request(testApp).get('/health').set('Accept', accept),
      406,
      'NOT_ACCEPTABLE',
    );
  },
);

test.each([
  '*/*',
  'application/*',
  'application/json',
  'text/html, application/json;q=0.5',
])('Accept %s permits JSON', async (accept) => {
  await request(testApp).get('/health').set('Accept', accept).expect(200);
});

test.each(['post', 'patch'])(
  '%s requires application/json even without a body',
  async (method) => {
    for (const contentType of [
      undefined,
      'text/plain',
      'application/vnd.api+json',
    ]) {
      const req = request(testApp)[method]('/v1/not-yet-implemented');
      if (contentType) req.set('Content-Type', contentType);
      expectApiError(await req, 415, 'UNSUPPORTED_MEDIA_TYPE');
    }
    const jsonRequest = request(testApp)[method]('/v1/not-yet-implemented');
    expectApiError(
      await jsonRequest
        .set('Content-Type', 'application/json; charset=utf-8')
        .send('{}'),
      404,
      'NOT_FOUND',
    );
  },
);

test('public docs/health paths are exempt from write Content-Type requirements', async () => {
  for (const path of publicPaths) {
    expectApiError(
      await request(testApp).post(path).type('text').send('anything'),
      405,
      'METHOD_NOT_ALLOWED',
    );
  }
});

test('malformed and primitive JSON never leak parser content', async () => {
  for (const body of ['{"password":"private",', '42']) {
    const res = await request(testApp)
      .post('/v1/missing')
      .type('json')
      .send(body);
    expectApiError(res, 400, 'MALFORMED_JSON');
    expect(res.text).not.toContain('private');
  }
});

test('10 kb body limit maps to the blueprint error contract', async () => {
  const res = await request(testApp)
    .post('/v1/missing')
    .send({ value: 'a'.repeat(10240) });
  expectApiError(res, 400, 'VALIDATION_FAILED');
  expect(res.body.error.details).toEqual([
    { field: 'body', issue: 'must not exceed 10 kb' },
  ]);
});

test('unsupported JSON charset and compressed input return uniform 415', async () => {
  expectApiError(
    await request(testApp)
      .post('/v1/missing')
      .set('Content-Type', 'application/json; charset=iso-8859-1')
      .send('{}'),
    415,
    'UNSUPPORTED_MEDIA_TYPE',
  );
  expectApiError(
    await request(testApp)
      .post('/v1/missing')
      .type('json')
      .set('Content-Encoding', 'gzip')
      .send('{}'),
    415,
    'UNSUPPORTED_MEDIA_TYPE',
  );
});

test('unknown public query keys are rejected', async () => {
  expectApiError(
    await request(testApp).get('/health?typo=1'),
    400,
    'VALIDATION_FAILED',
  );
});

test('request IDs are fresh UUIDs and untrusted supplied values are never echoed', async () => {
  const first = await request(testApp)
    .get('/health')
    .set('X-Request-Id', 'password=private');
  const second = await request(testApp).get('/health');
  expect(first.headers['x-request-id']).not.toBe('password=private');
  expect(first.headers['x-request-id']).not.toBe(
    second.headers['x-request-id'],
  );
});

test('CORS allows only configured origins and exposes useful response headers', async () => {
  const corsApp = createApp({
    config: loadConfig({ CORS_ORIGINS: 'https://portal.example.com' }),
    logger,
  });
  const allowed = await request(corsApp)
    .get('/health')
    .set('Origin', 'https://portal.example.com');
  expect(allowed.headers['access-control-allow-origin']).toBe(
    'https://portal.example.com',
  );
  expect(allowed.headers['access-control-expose-headers']).toContain(
    'X-Request-Id',
  );
  const denied = await request(corsApp)
    .get('/health')
    .set('Origin', 'https://other.example.com');
  expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  const disabled = await request(testApp)
    .get('/health')
    .set('Origin', 'https://portal.example.com');
  expect(disabled.headers['access-control-allow-origin']).toBeUndefined();
  const preflight = await request(corsApp)
    .options('/health')
    .set('Origin', 'https://portal.example.com')
    .set('Access-Control-Request-Method', 'GET')
    .expect(204);
  expect(preflight.headers['x-request-id']).toBeDefined();
});

test('docs serves HTML whose bootstrap is permitted by helmet CSP', async () => {
  const res = await request(testApp)
    .get('/docs')
    .set('Accept', 'text/html')
    .expect(200);
  expect(res.headers['content-type']).toMatch(/^text\/html/);
  expect(res.text).toContain('swagger-ui-dist@5.33.1');
  expect(res.text).toContain("url: '/openapi.json'");
  const bootstrap = res.text.match(/<script>([\s\S]*?)<\/script>/)[1];
  const hash = createHash('sha256').update(bootstrap).digest('base64');
  expect(res.headers['content-security-policy']).toContain(`'sha256-${hash}'`);
  expect(res.headers['content-security-policy']).toContain(
    'https://cdn.jsdelivr.net',
  );
  expectApiError(
    await request(testApp).get('/docs').set('Accept', 'application/json'),
    406,
    'NOT_ACCEPTABLE',
  );
});

test('generated specification is current and every documented operation is a registered route', async () => {
  const spec = parse(
    await readFile(new URL('../../openapi.yaml', import.meta.url), 'utf8'),
    { merge: true },
  );
  const res = await request(testApp).get('/openapi.json').expect(200);
  expect(res.body).toEqual(spec);
  const routes = testApp.router.stack.flatMap((layer) =>
    layer.route
      ? Object.keys(layer.route.methods)
          .filter((method) => method !== '_all')
          .map((method) => `${method} ${layer.route.path}`)
      : [],
  );
  const operations = Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.keys(item)
      .filter((method) =>
        [
          'get',
          'post',
          'patch',
          'put',
          'delete',
          'head',
          'options',
          'trace',
        ].includes(method),
      )
      .map((method) => `${method} ${path}`),
  );
  expect(routes.sort()).toEqual(operations.sort());
  expect(operations.sort()).toEqual([
    'get /docs',
    'get /health',
    'get /openapi.json',
  ]);
  for (const path of publicPaths)
    expect(spec.paths[path].get.security).toEqual([]);
});

test('Zod, ApiError, and unexpected faults go through the single handler', async () => {
  const router = express.Router();
  router.get('/zod', () => z.object({ name: z.string() }).parse({}));
  router.get('/api-error', () => {
    throw new ApiError('INVALID_QUERY', 400, 'Invalid query.', [
      { field: 'sort', issue: 'unsupported field' },
    ]);
  });
  router.get('/unexpected', () => {
    throw new Error('password=private JWT_SECRET=private token=private');
  });
  router
    .route('/methods')
    .all(methodNotAllowed(['GET', 'POST']))
    .get((_req, res) => res.json({}))
    .post((_req, res) => res.json({}));
  const faultApp = createApp({ logger, router });
  const validation = await request(faultApp).get('/zod');
  expectApiError(validation, 400, 'VALIDATION_FAILED');
  expect(validation.body.error.details[0].field).toBe('name');
  expectApiError(
    await request(faultApp).get('/api-error'),
    400,
    'INVALID_QUERY',
  );
  const fault = await request(faultApp).get('/unexpected');
  expectApiError(fault, 500, 'INTERNAL_ERROR');
  expect(fault.text).not.toContain('private');
  expect(fault.text).not.toContain('stack');
  expect(logger.error).toHaveBeenCalled();
  const methods = await request(faultApp).delete('/methods');
  expectApiError(methods, 405, 'METHOD_NOT_ALLOWED');
  expect(methods.headers.allow).toBe('GET, POST');
});

test('structured production logging omits secrets from headers, queries, bodies and error messages', async () => {
  const sink = { info: jest.fn(), error: jest.fn() };
  const router = express.Router();
  router.post('/fault', () => {
    throw new Error('password=private hash=private');
  });
  const logApp = createApp({ logger: createLogger(sink), router });
  await request(logApp)
    .post('/fault?token=private')
    .set('Authorization', 'Bearer private')
    .send({ password: 'private' });
  await request(logApp).get('/private');
  const output = JSON.stringify([sink.info.mock.calls, sink.error.mock.calls]);
  expect(output).not.toContain('private');
  const entries = sink.info.mock.calls.map(([line]) => JSON.parse(line));
  expect(entries[0]).toEqual(
    expect.objectContaining({
      event: 'request',
      method: 'POST',
      path: '/fault',
      status: 500,
      duration_ms: expect.any(Number),
      request_id: expect.any(String),
    }),
  );
  expect(entries[1].path).toBe('[unmatched]');
  const fault = JSON.parse(sink.error.mock.calls[0][0]);
  expect(fault.error_type).toBe('Error');
  expect(fault.frames.length).toBeGreaterThan(0);
});

test('Vercel entry exports the app and never starts a listener', async () => {
  const listen = jest.spyOn(express.application, 'listen');
  const entry = await import('../../api/index.js');
  expect(entry.default).toBe(app);
  expect(listen).not.toHaveBeenCalled();
  await request(entry.default).get('/health').expect(200);
  expect(app.get('trust proxy')).toBe(1);
});
