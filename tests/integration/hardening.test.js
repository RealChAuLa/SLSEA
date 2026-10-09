import { jest } from '@jest/globals';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';
import { expectApiError } from '../helpers/expect-api-error.js';

const logger = { info: jest.fn(), error: jest.fn() };
const spec = parse(
  await readFile(new URL('../../openapi.yaml', import.meta.url), 'utf8'),
  { merge: true },
);
const methods = [
  'get',
  'post',
  'patch',
  'put',
  'delete',
  'head',
  'options',
  'trace',
];
const app = createApp({ logger });

test.each(Object.entries(spec.paths))(
  'spec-generated unsupported-method sweep: %s',
  async (path, item) => {
    const declared = methods.filter((method) => item[method]);
    const uri = path.replace(/\{([^}]+)\}/g, (_match, name) =>
      name === 'timestamp' ? '2026-10-09T12%3A00%3A00.000Z' : '1',
    );
    for (const method of methods.filter(
      (method) => !declared.includes(method),
    )) {
      const agent = request(app);
      const res = await agent[method](uri)
        .set('Accept', path === '/docs' ? 'text/html' : 'application/json')
        .type('json');
      expect(res.status).toBe(405);
      expect(res.headers.allow).toBe(
        declared.map((method) => method.toUpperCase()).join(', '),
      );
      if (method === 'head') expect(res.text).toBeUndefined();
      else expectApiError(res, 405, 'METHOD_NOT_ALLOWED');
    }
  },
);

test('every operation documents the shared applicable errors and strict write responses', () => {
  for (const [path, item] of Object.entries(spec.paths))
    for (const method of methods.filter((method) => item[method])) {
      const operation = item[method];
      for (const status of ['400', '405', '406', '415', '429', '500'])
        expect(operation.responses[status]).toBeDefined();
      if (path.startsWith('/v1/') && path !== '/v1/auth/tokens')
        for (const status of ['401', '403'])
          expect(operation.responses[status]).toBeDefined();
      if (method === 'patch') {
        expect(operation.responses['204']).toBeDefined();
        expect(operation.responses['204'].content).toBeUndefined();
        expect(operation.responses['304']).toBeUndefined();
      }
    }
});

test('enabled request limits enforce global/login/shared password buckets, proxies and IPv6 with uniform 429', async () => {
  const limited = createApp({
    config: loadConfig({ RATE_LIMIT_ENABLED: 'true' }),
    db: {},
    logger,
  });
  const diagnostics = jest.spyOn(console, 'error').mockImplementation(() => {});
  const invalidAddress = await request(limited)
    .get('/health')
    .set('X-Forwarded-For', 'token=Private#Password2027');
  expectApiError(invalidAddress, 400, 'INVALID_QUERY');
  expect(invalidAddress.text).not.toContain('Private#Password2027');
  expect(diagnostics).not.toHaveBeenCalled();
  const get = (ip) =>
    request(limited).get('/health').set('X-Forwarded-For', ip);
  const login = (ip) =>
    request(limited)
      .post('/v1/auth/tokens')
      .set('X-Forwarded-For', ip)
      .send({});
  const patch = (ip, index) =>
    request(limited)
      .patch(index % 2 ? '/v1/users/me' : '/v1/users/1')
      .set('X-Forwarded-For', ip)
      .send({ new_password: 'Private#Password2027' });
  for (let n = 0; n < 600; n++) await get('198.51.100.1').expect(200);
  const blocked = await get('198.51.100.1');
  expectApiError(blocked, 429, 'RATE_LIMITED');
  expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  expect(blocked.headers.ratelimit).toContain('global');
  expect(blocked.headers['ratelimit-policy']).toBeDefined();
  expect(blocked.headers['cache-control']).toBe('no-store');
  await get('198.51.100.2').expect(200);
  for (let n = 0; n < 30; n++) await login('198.51.100.2').expect(400);
  expectApiError(await login('198.51.100.2'), 429, 'RATE_LIMITED');
  await get('198.51.100.2').expect(200);
  for (let n = 0; n < 10; n++) await patch('198.51.100.3', n).expect(401);
  expectApiError(await patch('198.51.100.3', 11), 429, 'RATE_LIMITED');
  for (let n = 0; n < 10; n++)
    await patch(
      n % 2 ? '2001:db8:ab00:12ff::99' : '2001:db8:ab00:1201::1',
      n,
    ).expect(401);
  expectApiError(await patch('2001:db8:ab00:1234::2', 11), 429, 'RATE_LIMITED');
  await patch('2001:db8:ab00:1300::1', 1).expect(401);
  const disabled = createApp({
    config: loadConfig({ RATE_LIMIT_ENABLED: 'false' }),
    db: {},
    logger,
  });
  for (let n = 0; n < 35; n++) {
    const res = await request(disabled)
      .post('/v1/auth/tokens')
      .send({})
      .expect(400);
    expect(res.headers.ratelimit).toBeUndefined();
  }
  expect(JSON.stringify(logger.info.mock.calls)).not.toContain(
    'Private#Password2027',
  );
  expect(logger.error).not.toHaveBeenCalled();
});
