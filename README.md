# SLSEA Solar Generation Data API

REST API for Sri Lanka Sustainable Energy Authority rooftop solar generation data.
The full design uses Express, plain JavaScript, Prisma/PostgreSQL on Neon, JWT
principals for devices and staff, and Vercel hosting. [project.md](project.md)
defines the contract; [implementation_plan.md](implementation_plan.md) defines
the increments.

**Current increment: I0 Foundations.** The public health check, OpenAPI/Swagger
surface, HTTP plumbing, tests, and CI are implemented. Database setup, seeds,
authentication, and all `/v1` domain endpoints belong to later increments. Work
stops at I0 until the owner requests I1.

## Local setup

Use Node.js **24 LTS** and its bundled npm. No database or credentials are needed
for I0.

```sh
npm ci
cp .env.example .env
npm run build
npm start
```

On PowerShell, copy the example with `Copy-Item .env.example .env`. Open
`http://localhost:3000/health`, `http://localhost:3000/docs`, or
`http://localhost:3000/openapi.json`. Swagger UI needs internet access to load its
pinned CDN assets. `requests.http` contains additional smoke requests.

If the local npm launcher points to a missing installation, invoke the CLI from
your Node installation directly. On this workstation that is
`node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"`; append the usual
arguments such as `ci`, `start`, or `run lint`. This avoids changing global npm
settings.

## Scripts

| Script        | Purpose                                                           |
| ------------- | ----------------------------------------------------------------- |
| `start`       | Local server from `src/server.js`                                 |
| `dev`         | Local server with Node watch mode                                 |
| `build`       | Generate `openapi.json`; Prisma generation will be added in I1    |
| `spec:build`  | Convert hand-written YAML into bundled JSON                       |
| `lint`        | ESLint and Prettier checks                                        |
| `format`      | Format maintained project files                                   |
| `spec:lint`   | Rebuild and validate both YAML and JSON with Redocly              |
| `test`        | Rebuild spec, then run Jest/Supertest with Node's ESM support     |
| `db:migrate`  | Explicit I1 placeholder; exits unsuccessfully without changing DB |
| `seed`        | Explicit I1 placeholder                                           |
| `seed:tokens` | Explicit I1 placeholder                                           |
| `seed:extend` | Explicit I7 placeholder                                           |
| `simulate`    | Explicit I6 placeholder                                           |

JavaScript uses ESM throughout (`type: module`), matching the planned Prisma
**major 7** setup. Prisma is not installed in I0; I1 must pin matching client,
CLI, and adapter versions within major 7. The choice follows
[Prisma 7's ESM/adapter requirements](https://www.prisma.io/docs/orm/v7).
Jest runs through `node --experimental-vm-modules`, with no transpiler. Its Node
experimental-feature warning is expected.

## Configuration

All runtime environment access goes through `src/config/index.js`. Dotenv loads
the optional `.env` file; Zod validates configuration when the app is imported.
Invalid configuration stops startup and reports variable names without values.

| Active variable | Default       | Validation                                                   |
| --------------- | ------------- | ------------------------------------------------------------ |
| `NODE_ENV`      | `development` | `development`, `test`, or `production`                       |
| `PORT`          | `3000`        | Integer 1–65535, used only by the local server               |
| `CORS_ORIGINS`  | empty list    | Comma-separated exact HTTP(S) origins; no paths or wildcards |

An empty CORS list disables cross-origin browser access; same-origin requests
still work. Add the actual frontend origins before enabling cross-origin use.

`.env.example` also lists all future blueprint variables: `DATABASE_URL`,
`DIRECT_URL`, `TEST_DATABASE_URL`, `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`,
`USER_TOKEN_TTL_SECONDS`, `DEVICE_TOKEN_TTL_DAYS`, `STALE_AFTER_MINUTES`,
`DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE`, `MAX_POWER_KW`, `SEED_DEMO_PASSWORD`,
`SEED_RANDOM`, and `API_BASE_URL`. I0 does not read or require these. Secrets must
be supplied privately when their increments are implemented.

## HTTP foundations

- Public `GET /health` returns `{ "status": "ok" }`. It is a liveness check.
- Public `GET /openapi.json` serves the generated OpenAPI 3.0.3 document.
- Public `GET /docs` serves HTML with Swagger UI and JWT Authorize support.
- API requests negotiate JSON; `/docs` negotiates HTML. Unacceptable `Accept`
  returns `406 NOT_ACCEPTABLE`. Other POST/PATCH requests require exactly
  `application/json`, including when the request body is empty (`415` otherwise).
- JSON parsing has a 10 kb limit. Malformed/primitive JSON returns
  `400 MALFORMED_JSON`; oversized JSON returns `400 VALIDATION_FAILED`. Unsupported
  charset or compressed JSON returns `415 UNSUPPORTED_MEDIA_TYPE`.
- Unknown routes return `404`; unsupported methods on known paths return `405`
  with `Allow: GET`. The method guard also prevents Express's implicit HEAD.
  Configured-origin CORS preflights are handled separately with `204`.
- All errors use `{ error: { code, message, status, details, request_id } }`.
  Unexpected faults have a generic `500` response.
- Every response has a fresh server-generated UUID `X-Request-Id`; incoming IDs
  are never echoed. Helmet adds security headers; Swagger bootstrap uses a CSP
  hash and pinned CDN assets. GET responses set `Vary: Accept, Authorization`.
- Successful GETs emit a strong SHA-256 representation ETag. Conditional
  evaluation is reserved for I3, so Express's automatic `304` handling is bypassed.
- Logs contain request ID, method, matched route template, status, and duration.
  Unknown paths are recorded as `[unmatched]`. Headers, queries, request bodies,
  error messages, tokens, passwords, and hashes are omitted. Server faults retain
  the error type and stack source locations for diagnosis.

`src/app.js` builds/exports the app without listening; `api/index.js` re-exports
it for Vercel. Only `src/server.js` opens a local listener. The app trusts the
closest proxy hop (`trust proxy: 1`); direct local requests still work normally.

## Validation and CI

```sh
npm run build
npm run lint
npm run spec:lint
npm test
```

Tests cover the public endpoints, uniform errors, security headers, negotiation,
method guards, JSON/body limits, CORS, configuration, safe logging, clock control,
OpenAPI/router parity, and importing the Vercel entry without a listener. I0 tests
do not connect to a database. CI runs the same gates on Node 24 with a disposable
PostgreSQL 17 service and a separate `TEST_DATABASE_URL` prepared for I1.
The CI password is a public fixture for the disposable service, never a deployment
credential. Remote CI status can only be established after pushing to GitHub.

## Owner deployment checklist

I0 uses the explicit Node function entry `api/index.js`, with rewrites in
`vercel.json`, `framework: null` to select that entry consistently, and
`includeFiles: openapi.json` to retain the generated spec. Default app export is
supported by [Vercel's Express documentation](https://vercel.com/docs/frameworks/backend/express);
the explicit function follows its
[Node runtime configuration](https://vercel.com/docs/functions/runtimes/node-js)
and [rewrite configuration](https://vercel.com/docs/routing/rewrites).

The owner handles deployment. For an I0 preview:

- [ ] Connect the repository to a Vercel project using Node 24.
- [ ] Use the checked-in configuration and `npm run build`.
- [ ] Set `NODE_ENV=production` and the required `CORS_ORIGINS` (or leave it empty).
- [ ] Deploy and verify `/health`, `/docs`, and `/openapi.json`.

Complete this checklist as later increments become available:

- [ ] Create the Neon database and development branch, plus an isolated test branch.
- [ ] Set the private runtime environment variables in Vercel, using Neon pooled
      `DATABASE_URL`. Keep `DIRECT_URL` for owner-run migrations/seed.
- [ ] Run `npm run db:migrate`, then the destructive `npm run seed` against the
      intended development branch; retain `seed-output/device-tokens.json` privately.
- [ ] Deploy the completed API. Never migrate or seed during the Vercel build.
- [ ] Run `npm run seed:extend` before a demo.
- [ ] Verify health, Swagger UI, a user login, and a device POST with `simulate`.

Do not use the placeholder scripts for these future steps in I0.
