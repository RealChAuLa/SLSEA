import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { loadSmokeConfig } from '../src/config/data.js';
import { buildDataset } from '../prisma/seed-lib/dataset.js';
import { startOfLocalDay } from '../src/utils/time.js';
import { isMainModule, runCli, CliUsageError } from '../src/utils/cli.js';
import { apiUrl } from './simulate.js';

export function parseSmokeArgs(args, defaultUrl = 'http://localhost:3000') {
  if (args.length && (args.length !== 2 || args[0] !== '--base-url'))
    throw new CliUsageError('Use smoke with optional --base-url <origin>.');
  return { baseUrl: apiUrl(args.length ? args[1] : defaultUrl) };
}

export async function smokeApi({
  baseUrl,
  demoPassword,
  tokenFile,
  fetchImpl = fetch,
  clock = () => new Date(),
}) {
  baseUrl = apiUrl(baseUrl);
  const metrics = { checks: 0, demoLogins: 0 },
    bearers = new Map();
  async function call(
    path,
    { method = 'GET', auth, body, headers = {}, status = 200 } = {},
  ) {
    const started = performance.now();
    const response = await fetchImpl(new URL(path, baseUrl), {
      method,
      headers: {
        Accept: path === '/docs' ? 'text/html' : 'application/json',
        ...(auth ? { Authorization: auth } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
      redirect: 'error',
    });
    const text = await response.text();
    assert.equal(
      response.status,
      status,
      `Smoke status mismatch: ${method} ${path.split('?')[0]}`,
    );
    if (status === 204 || status === 304) assert.equal(text, '');
    const json =
      response.headers.get('content-type')?.includes('application/json') && text
        ? JSON.parse(text)
        : undefined;
    if (path !== '/openapi.json' && json && method !== 'POST') {
      assert(
        !/"(?:password_hash|pv|JWT_SECRET|token|access_token)"\s*:/.test(text),
      );
      assert(!text.includes(demoPassword));
    }
    metrics.checks++;
    return { response, json, ms: Math.round(performance.now() - started) };
  }
  async function login(user, password = demoPassword, status = 200) {
    const result = await call('/v1/auth/tokens', {
      method: 'POST',
      body: { email: user.email, password },
      status,
    });
    return status === 200 ? `Bearer ${result.json.access_token}` : undefined;
  }
  await call('/health');
  await call('/docs');
  const spec = await call('/openapi.json');
  metrics.apiVersion = spec.json.info.version;
  const users = buildDataset({ scale: 'full' }).users;
  for (const user of users) {
    const auth = await login(user);
    bearers.set(user.name, auth);
    metrics.demoLogins++;
    const profile = await call('/v1/users/me', { auth });
    assert.equal(profile.json.user_id, user.user_id);
    await call('/v1/users', { auth });
    const summary = await call('/v1/generation-summary', { auth });
    assert.equal(
      summary.json.scope.type,
      user.jurisdiction_type === 'provincial'
        ? 'province'
        : user.jurisdiction_type,
    );
  }
  const auth = bearers.get('National Operator');
  for (const path of [
    '/v1/provinces',
    '/v1/provinces/1',
    '/v1/provinces/1/districts',
    '/v1/districts/1',
    '/v1/districts/1/grid-substations',
    '/v1/grid-substations/1',
    '/v1/grid-substations/1/installations',
    '/v1/installations',
    '/v1/installations/1',
    '/v1/installations/1/overview',
    '/v1/installations/1/last-known-reading',
    '/v1/provinces/1/generation-summary',
    '/v1/districts/1/generation-summary',
    '/v1/grid-substations/1/generation-summary',
  ])
    await call(path, { auth });
  const historyPath = '/v1/installations/1/readings?page_size=50';
  const history = await call(historyPath, { auth });
  assert(history.json.data.length > 0);
  await call(historyPath, {
    auth,
    headers: { 'If-None-Match': history.response.headers.get('etag') },
    status: 304,
  });
  await call(historyPath, {
    auth,
    headers: {
      'If-Modified-Since': history.response.headers.get('last-modified'),
    },
    status: 304,
  });
  await call(historyPath, {
    auth,
    headers: { 'If-Match': '"not-current"' },
    status: 412,
  });
  const clockTime = clock(),
    to = new Date(startOfLocalDay(clockTime).getTime() + 86400000),
    from = new Date(to.getTime() - 7 * 86400000);
  const trendPath = `/v1/generation-trend?${new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), interval: 'day' })}`;
  const trend = await call(trendPath, { auth });
  assert.equal(trend.json.pagination.total_count, 7);
  metrics.nationalSevenDayTrendMs = trend.ms;
  await call(trendPath, {
    auth,
    headers: { 'If-None-Match': trend.response.headers.get('etag') },
    status: 304,
  });
  const rootHistory = await call(
    `/v1/readings?${new URLSearchParams({ from: new Date(clockTime.getTime() - 86400000).toISOString(), to: clockTime.toISOString(), page_size: '50' })}`,
    { auth },
  );
  metrics.national24HourReadingsMs = rootHistory.ms;
  metrics.readingsIn24Hours = rootHistory.json.pagination.total_count;
  await call('/v1/districts/4', {
    auth: bearers.get('Colombo District Officer'),
    status: 403,
  });
  const device = tokenFile.tokens.find((row) => row.site_id === 1);
  assert(device);
  await call('/v1/installations/1', {
    auth: `Bearer ${device.token}`,
    status: 403,
  });
  const latest = history.json.data[0];
  const input = {
    timestamp: new Date(
      Math.max(clock().getTime(), new Date(latest.timestamp).getTime() + 1),
    ).toISOString(),
    power_Kw: 1,
    cumulative_energy_Kwh: Number(
      (latest.cumulative_energy_Kwh + 0.001).toFixed(3),
    ),
    voltage: 230,
  };
  await call('/v1/installations/1/readings', {
    method: 'POST',
    auth,
    body: input,
    status: 403,
  });
  const created = await call('/v1/installations/1/readings', {
    method: 'POST',
    auth: `Bearer ${device.token}`,
    body: input,
    status: 201,
  });
  const location = new URL(created.response.headers.get('location'));
  assert.equal(location.origin, new URL(baseUrl).origin);
  await call(location.pathname, { auth });
  metrics.deviceIngestion = 201;
  const analyst = users.find((user) => user.name === 'National Analyst'),
    old = bearers.get(analyst.name),
    temporary = `Smoke#1${randomUUID()}`;
  let changeAttempted = false,
    fresh;
  try {
    changeAttempted = true;
    await call('/v1/users/me', {
      method: 'PATCH',
      auth: old,
      body: { current_password: demoPassword, new_password: temporary },
      status: 204,
    });
    const revoked = await call('/v1/users/me', { auth: old, status: 401 });
    assert.equal(revoked.json.error.code, 'TOKEN_REVOKED');
    await login(analyst, demoPassword, 401);
    fresh = await login(analyst, temporary);
    await call('/v1/users/me', { auth: fresh });
    metrics.passwordChange = 204;
  } finally {
    if (changeAttempted) {
      // An interrupted response can follow a committed update. Probe both
      // credentials rather than assuming that a failed request changed nothing.
      if (!fresh) {
        try {
          fresh = await login(analyst, temporary);
        } catch {
          await login(analyst);
        }
      }
      if (fresh) {
        try {
          await call('/v1/users/me', {
            method: 'PATCH',
            auth: fresh,
            body: { current_password: temporary, new_password: demoPassword },
            status: 204,
          });
        } finally {
          await login(analyst);
        }
      }
      await login(analyst);
      metrics.demoPasswordRestored = true;
    }
  }
  return metrics;
}

export async function runSmoke(args = process.argv.slice(2)) {
  const settings = loadSmokeConfig(),
    options = parseSmokeArgs(args, settings.apiBaseUrl);
  const tokenFile = JSON.parse(
    await readFile(
      new URL('../seed-output/device-tokens.json', import.meta.url),
      'utf8',
    ),
  );
  const result = await smokeApi({
    ...options,
    demoPassword: settings.demoPassword,
    tokenFile,
  });
  console.info(JSON.stringify(result));
}
if (isMainModule(import.meta.url)) await runCli('smoke', () => runSmoke());
