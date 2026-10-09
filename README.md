# SLSEA Solar Generation Data API

REST API for Sri Lanka Sustainable Energy Authority rooftop solar generation data.
The full design uses Express, plain JavaScript, Prisma/PostgreSQL on Neon, JWT
principals for devices and staff, and Vercel hosting. [project.md](project.md)
defines the contract; [implementation_plan.md](implementation_plan.md) defines
the increments.

**Current increment: I5 Operational reads, verified.**
I2 authentication/policy (58a0bc0) and I3 hierarchy reads (1874853) are complete.
I4 adds the three history GETs, deterministic seven-day reading seed and
Last-Modified/If-Modified-Since. I5 adds last-known readings, installation
overviews, reporting filters and latest-reading list includes. All 128 tests
passed across 18 suites; build, lint and OpenAPI validation passed. The full supplied Neon database holds 240
installations and 160,584 readings, with 240 verified device credentials.
No Docker/local database was used. I6 has not started.

Log in with any seeded email listed in Swagger and the demo password
`Solar#Demo2026`. Send the returned `access_token` as `Authorization: Bearer ...`
to `/v1/users/me`. Responses expose only the public profile fields. Device tokens
cannot call user or hierarchy read endpoints.

Available hierarchy GETs: `/v1/provinces`, `/v1/provinces/{provinceId}`,
`/v1/provinces/{provinceId}/districts`, `/v1/districts/{districtId}`,
`/v1/districts/{districtId}/grid-substations`,
`/v1/grid-substations/{substationId}`,
`/v1/grid-substations/{substationId}/installations`, `/v1/installations`, and
`/v1/installations/{siteId}`. Every domain GET requires a user bearer token;
hierarchy GETs require `generation:read`, and the own profile requires
`account:manage`. District callers may navigate through their parent province's
metadata, while child lists stay restricted to their district.

Collections accept `page`, `page_size`, and `sort=name|-name`. Installations also
accept `province_id`, `district_id`, and `substation_id`; filters are intersected
with the caller's scope. Unknown query parameters and invalid IDs are rejected.
Lists return `data`, `pagination`, absolute `links`, and a `Link` header. Empty
lists use `total_pages: 0` with first/last pointing to page 1; pages beyond the end
have empty data and a `prev` link to the last real page. Name ties use ascending
primary key order. Pagination honors the forwarded protocol/host.

GETs emit a strong ETag. Send `If-None-Match` to receive an empty `304` for the
same representation, or `If-Match` to require a matching representation (`412`
on mismatch). Authentication, token revocation, validation and jurisdiction
checks run first. Strong/weak comparisons and evaluation order follow
[RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.2).

## Local setup

Use Node.js **24 LTS** and its bundled npm. The public health/docs surface needs
no database connection. Owner database tools need the private settings below.

```sh
npm ci
npm run build
npm start
```

If `.env` does not already exist, copy `.env.example` to `.env` and fill its private
settings. On PowerShell use `Copy-Item .env.example .env`. Preserve an existing
`.env`; it may contain owner credentials. Open
`http://localhost:3000/health`, `http://localhost:3000/docs`, or
`http://localhost:3000/openapi.json`. Swagger UI needs internet access to load its
pinned CDN assets. `requests.http` contains additional smoke requests.

If the local npm launcher points to a missing installation, invoke the CLI from
your Node installation directly. On this workstation that is
`node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"`; append the usual
arguments such as `ci`, `start`, or `run lint`. This avoids changing global npm
settings.

## Scripts

| Script        | Purpose                                                        |
| ------------- | -------------------------------------------------------------- |
| `start`       | Local server from `src/server.js`                              |
| `dev`         | Local server with Node watch mode                              |
| `build`       | Generate/compile the Prisma client and generate `openapi.json` |
| `db:generate` | Generate the Prisma client without connecting to a database    |
| `spec:build`  | Convert hand-written YAML into bundled JSON                    |
| `lint`        | ESLint and Prettier checks                                     |
| `format`      | Format maintained project files                                |
| `spec:lint`   | Rebuild and validate both YAML and JSON with Redocly           |
| `test`        | Generate client/spec and run all Jest/Supertest tests          |
| `test:unit`   | Run database-free unit tests                                   |
| `db:migrate`  | Owner-run Prisma migrate deploy using DIRECT_URL               |
| `seed`        | Replace reference data/history and generate device tokens      |
| `seed:tokens` | Regenerate device tokens without modifying database rows       |
| `seed:extend` | Explicit I7 placeholder                                        |
| `simulate`    | Explicit I6 placeholder                                        |

Application, scripts, tests, and Prisma config use plain JavaScript ESM
(`type: module`). Prisma CLI/client/PostgreSQL adapter are pinned together at
**7.10.0**. The choice follows
[Prisma 7's ESM/adapter requirements](https://www.prisma.io/docs/orm/v7).
The supported `prisma-client` generator emits TypeScript; a build-only compiler
converts that generated output into JavaScript under `src/generated/prisma`.
Hand-written application code stays JavaScript. Both generated directories are
ignored and recreated during the build. The build does not migrate or seed.
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

I1's database/token/seed settings are loaded and Zod-validated by
`src/config/data.js` when the corresponding module or owner tool starts. Public
health/docs imports remain database-free. All error messages identify variable
names without printing credential values.

| I1 variable                  | Use / default                                                                |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `DATABASE_URL`               | Neon pooled URL for the runtime singleton                                    |
| `DIRECT_URL`                 | Non-pooled URL for migrations and seed; same database as runtime             |
| `TEST_DATABASE_URL`          | Direct URL for a different Neon test branch or disposable PostgreSQL         |
| `TEST_ALLOW_SHARED_DATABASE` | `no`; explicit `yes` permits destructive tests on the application database   |
| `JWT_SECRET`                 | At least 32 random bytes, provided privately                                 |
| `JWT_ISSUER`, `JWT_AUDIENCE` | Both default to `slsea-solar-api`                                            |
| `USER_TOKEN_TTL_SECONDS`     | Positive integer, default 3600                                               |
| `DEVICE_TOKEN_TTL_DAYS`      | Positive integer, default 365                                                |
| `SEED_DEMO_PASSWORD`         | `Solar#Demo2026`; quote values containing `#` in dotenv files                |
| `SEED_RANDOM`                | Unsigned 32-bit integer, default 20260601                                    |
| `SEED_CONFIRM`               | `no`; optional `yes` replaces the CLI confirmation flag                      |
| `DEFAULT_PAGE_SIZE`          | Default collection page size, 50; positive and no greater than MAX_PAGE_SIZE |
| `MAX_PAGE_SIZE`              | Maximum collection page size, 500; positive and capped at 500                |
| `STALE_AFTER_MINUTES`        | Positive integer, default 30; freshness threshold for operational reads      |

The Neon reference supplied by the owner selects a production branch. Its pooled
connection is kept only in the ignored local `.env`. At the owner's explicit
request, runtime, migrations, seed, and integration checks use this one database.
The direct connection was derived from its pooled hostname; no local database,
Docker, or additional Neon database/branch was used. Shared-database tests were
explicitly enabled for this review, then the full reference seed was restored.
No `neon login`, global skills/MCP installation,
link, or `neon deploy` is required for this Prisma implementation or was executed.
Project ID reference: `summer-thunder-32230894`.

`.env.example` also reserves `MAX_POWER_KW` and
`API_BASE_URL` for later increments.

## I1 owner database commands

After selecting the intended database and setting its pooled `DATABASE_URL` and
non-pooled `DIRECT_URL` in the ignored `.env`:

```sh
npm run build
npm run db:migrate
npm run seed -- --yes
```

Seed prints the target host and refuses to truncate without `--yes` or
`SEED_CONFIRM=yes`. It inserts explicit IDs in one transaction, hashes the demo
password once using bcrypt cost 12, resets all five identity sequences, generates
one device JWT per installation, and self-checks reference counts, parent links,
user jurisdictions, and token identities. Full scale has 9/25/30/240 reference
rows and 7 users; `npm run seed -- --scale test --yes` uses Western/Central,
36 installations, and all 7 users. Device credentials are written atomically to
the ignored `seed-output/device-tokens.json`. Keep them private.

The reading table and its nonnegative-value CHECK constraint exist in I1, but
reading generation is now part of the seed: 672 quarter-hour readings per normal
installation, 648 for the offline fixture (6-hour gap), and none for the empty
fixture. Test scale uses 192/168/0 respectively. The second migration is hand-written and
also enforces the national/non-national user jurisdiction invariant. The first
migration is generated from the schema without connecting to a database.

To regenerate credentials after a lost file or a signing-key change:

```sh
npm run seed:tokens
```

This reads installations in bounded pages and verifies the generated tokens;
it does not truncate or modify database records.

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
- Successful GETs emit a strong SHA-256 representation ETag. The shared
  conditional helper controls `304`/`412`; Express's automatic freshness handling
  is bypassed so authorization and preconditions run in the required order.
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

I1 through I5 have been verified locally against the supplied Neon database.

Tests cover the public endpoints, uniform errors, security headers, negotiation,
method guards, JSON/body limits, CORS, configuration, safe logging, clock control,
OpenAPI/router parity, and importing the Vercel entry without a listener. I1 adds
unit coverage for deterministic geography, compact fixtures, bcrypt, token
claims/invalid tokens, config isolation, and destructive-seed confirmation. New
integration tests migrate/reset/seed **only** `TEST_DATABASE_URL` and check the
reference self-check, constraints, duplicate readings, and sequence advancement.
By default the helper refuses URLs identifying the same database as runtime/owner settings,
including pooled/direct host aliases or different roles on the same database.
An absent test URL fails explicitly. `TEST_ALLOW_SHARED_DATABASE=yes` explicitly
permits the same database when the owner authorizes it. Integration tests truncate
the reference tables and load the compact test dataset. After testing on the
shared database, run `npm run seed -- --yes` to restore the full reference dataset
and its device credentials. No tests were run during initial I1 authoring;
the subsequent I1 review passed all 73 tests. I2/I3 bring the suite to 110 tests,
covering seven-user login, token revocation, the jurisdiction matrix, every I3
endpoint and method guard, filtering, sorting, pagination and conditional ordering.
I4/I5 bring the suite to 128 tests, adding deterministic history generation,
time-window boundaries, reading conditionals, local-day energy baselines,
fresh/stale/empty operational responses, strict list options and constant query
counts. Full-scale includes use 6 queries for both 1-item and 200-item pages.
The full seven-day dataset was restored after verification. A default-app smoke
check passed all seven logins and verified scoped full-scale counts, cached 304
responses, health/docs, and unauthenticated denial. Remote CI is unverified for
the new local increments.
CI runs the same gates on Node 24 with a disposable PostgreSQL 17 service and a
separate `TEST_DATABASE_URL`.
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

## Reading history (I4)

GET /v1/installations/{siteId}/readings returns a paginated history; append a
URL-encoded timestamp for one atomic reading. GET /v1/readings returns the caller's
scoped history and accepts province_id, district_id, substation_id and site_id.
Both collections accept from (inclusive), to (exclusive), timestamp/-timestamp
sort (newest first by default), page and page_size. Root history defaults to the
last 24 hours and caps the window at 31 days; site history has no default window.
ISO timestamps require Z or an offset. Encode a positive offset's + as %2B,
for example ?from=2026-10-09T00:00:00%2B05:30.

Last-Modified is the newest timestamp on the selected page and is absent on empty
pages. If-Modified-Since uses HTTP dates, follows If-Match, and is ignored when
If-None-Match is supplied. Authentication and jurisdiction are always checked
first. POST ingestion and seed:extend remain later-increment placeholders.

## Operational reads (I5)

`GET /v1/installations/{siteId}/last-known-reading` returns the newest reading
with `age_seconds` and `is_stale`. Age is whole elapsed seconds, clamped to zero;
staleness means the timestamp is strictly older than `STALE_AFTER_MINUTES`.
An installation with no readings returns `404`. Its reading timestamp supplies
`Last-Modified`, and both ETag and HTTP-date conditional requests are supported.

`GET /v1/installations/{siteId}/overview` includes installation fields, parent
substation/district/province IDs and names, a compact `last_known_reading`, and
`today` with `energy_Kwh`, `peak_power_Kw` and `reading_count`. Today starts at
midnight in Asia/Colombo (UTC+05:30). Energy is the latest counter today minus the
last counter before midnight, falling back to the first counter today; no today
readings produce zero totals. An empty installation has a null latest reading.

Both installation lists accept `reporting=true|false` and
`include=last_known_reading`, alongside their existing pagination and sorting.
Reporting filters narrow the caller's scope before counting and pagination.
Includes fetch latest readings for the selected page in one query, with a null
value for empty installations. Nested readings omit the site/meter IDs already
present on the parent. Unknown options are rejected. Overviews and installation
lists use ETags without a `Last-Modified` header. All operations require a user
token with `generation:read` and enforce jurisdiction before conditional responses.

The restored full seed has 238 reporting installations, stale fixture 239 and
empty fixture 240. Seeded freshness ages naturally until data is extended;
`seed:extend` is implemented in I7. I6 has not started.
