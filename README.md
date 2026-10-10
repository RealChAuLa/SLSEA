# SLSEA Solar Generation Data API

Sri Lanka Sustainable Energy Authority rooftop solar API, implemented through
I10 with Express 5, plain JavaScript ESM, Prisma 7/PostgreSQL on Neon, JWT staff
and device principals, and Vercel Functions. [project.md](project.md) defines
the contract; [implementation_plan.md](implementation_plan.md) records delivery.
Swagger is available at `/docs` and the OpenAPI 1.0.0 contract at `/openapi.json`.

I10 implementation commit: **3872f59**; final privacy repair: **547338f**. Local verification passed **231 tests in
29 suites**, build, lint, OpenAPI validation, security/serializer checks, a
spec-generated method sweep and bidirectional router/spec parity. Remote CI and
public Vercel verification are recorded separately below.

## Requirements and setup

Use Node.js **24.x** and npm. Preserve an existing private `.env`; otherwise copy
`.env.example` and supply the private settings below. Credentials never belong
in Git. Public health/docs imports work without database or JWT settings.

```sh
npm ci
npm run build
npm run db:migrate
npm run seed -- --yes
npm start
```

The owner has explicitly selected one existing Neon production database for
runtime, migration, seed and tests. This overrides the blueprint's separate
development/test target examples. No Docker, local database or additional Neon
branch is used. Tests and seed replace data; run them serially and restore the
full demo seed afterward. On this workstation the npm launcher can be invoked as
`node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"` followed by
the normal npm arguments.

## Environment

All environment access is centralized under `src/config/`. Dotenv is optional;
configuration errors identify variable names without exposing their values.

| Variable                             | Use / default                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                           | `development`; use `production` on Vercel                                                          |
| `PORT`                               | `3000`; local listener only                                                                        |
| `CORS_ORIGINS`                       | Empty by default; comma-separated exact frontend origins, without paths/trailing slashes/wildcards |
| `RATE_LIMIT_ENABLED`                 | `true`; only the literal `true` or `false` is accepted                                             |
| `DATABASE_URL`                       | Private pooled Neon runtime URL, including SSL query parameters                                    |
| `DIRECT_URL`                         | Direct connection to the same database; owner migration/seed tools                                 |
| `TEST_DATABASE_URL`                  | Direct URL for tests; same as `DIRECT_URL` for this owner's setup                                  |
| `TEST_ALLOW_SHARED_DATABASE`         | `no`; owner explicitly uses `yes` to permit shared-target destructive tests                        |
| `JWT_SECRET`                         | Private signing secret, at least 32 bytes; use the same value locally and on Vercel                |
| `JWT_ISSUER`, `JWT_AUDIENCE`         | `slsea-solar-api`                                                                                  |
| `USER_TOKEN_TTL_SECONDS`             | `3600`                                                                                             |
| `DEVICE_TOKEN_TTL_DAYS`              | `365`                                                                                              |
| `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE` | `50`, `500`; maximum cannot exceed 500                                                             |
| `STALE_AFTER_MINUTES`                | `30`                                                                                               |
| `MAX_POWER_KW`                       | `50`                                                                                               |
| `SEED_DEMO_PASSWORD`                 | `Solar#Demo2026`; quote values containing `#` in dotenv                                            |
| `SEED_RANDOM`                        | `20260601`; deterministic unsigned 32-bit seed                                                     |
| `SEED_CONFIRM`                       | `no`; prefer an explicit one-off `--yes`                                                           |
| `API_BASE_URL`                       | `http://localhost:3000`; simulator and smoke HTTP origin                                           |

An empty CORS list disables cross-origin browser access. Swagger on the API's
own origin still works. Changing the signing secret requires regenerating the
private device-token file and invalidates tokens signed with the previous key.

## Scripts and seed

| Script                    | Purpose                                                                         |
| ------------------------- | ------------------------------------------------------------------------------- |
| `start`, `dev`            | Local server / watch mode                                                       |
| `build`                   | Generate/compile Prisma client and generate `openapi.json`; no database changes |
| `db:generate`             | Generate Prisma client only                                                     |
| `spec:build`, `spec:lint` | Generate specification / validate YAML and JSON                                 |
| `lint`, `format`          | ESLint + formatting checks / format maintained files                            |
| `test`, `test:unit`       | Full Jest/Supertest gates / database-free unit tests                            |
| `db:migrate`              | Owner-run migration deploy through `DIRECT_URL`                                 |
| `seed`                    | Destructive full reference/history seed plus device credentials                 |
| `seed:tokens`             | Regenerate credentials without changing database rows                           |
| `seed:extend`             | Append deterministic due history for normal sites                               |
| `simulate`                | POST readings using private device tokens over real HTTP                        |
| `smoke`                   | End-to-end API verification, including writes and password restoration          |

Full seed inserts explicit stable IDs for **9 provinces, 25 districts, 30 grid
substations, 240 installations and 7 users**, advances identity sequences and
creates **160,584 readings**. Normal sites have 672 quarter-hour readings over
seven days; offline site 239 has 648 with a six-hour gap; site 240 is empty.
Counters are monotonic, values and coordinates deterministic, bcrypt cost is
12, and insertion batches contain at most 5,000 rows. Seed self-checks counts,
relationships, fixtures, intervals and all 240 credentials.

The ignored `seed-output/device-tokens.json` contains one signed device token
per site. Keep it private; it is excluded from the deployment. `seed:tokens`
recreates it after loss or a key change, without truncating data.

```sh
npm run seed -- --yes
npm run seed:tokens
npm run seed:extend
npm run simulate -- --site 1 --count 1
npm run simulate -- --all --base-url https://your-api.vercel.app
npm run smoke -- --base-url https://your-api.vercel.app
```

The simulator continues from the latest stored counter, skips sites with no due
slot and reports created/failed/skipped totals. `--count` caps due readings per
site; it does not fabricate future slots. `--all` includes the two fixture sites
and can change their state. History extension excludes those fixtures, uses the
same deterministic generator and installation locks, and adds zero rows when
repeated at the same target time. Compact integration fixtures use `--scale test`
(36 installations and all seven users).

The smoke script logs in as every demo user; checks hierarchy, summaries,
history, trends, conditional responses and jurisdiction denials; posts a real
reading for site 1; changes the National Analyst password and verifies token
revocation; then restores its demo password in cleanup. It adds a reading and
revokes that user's old tokens. Run it when these demo actions are appropriate.
It prints only safe counters/statuses/timings. `requests.http` provides manual
request templates; keep real tokens out of that tracked file.

## Demo users

All seeded users initially use `Solar#Demo2026` (or `SEED_DEMO_PASSWORD`).

| User                     | Email                        | Jurisdiction |
| ------------------------ | ---------------------------- | ------------ |
| National Operator        | `national.operator@slsea.lk` | National     |
| National Analyst         | `national.analyst@slsea.lk`  | National     |
| Western Province Officer | `western.province@slsea.lk`  | Province 1   |
| Central Province Officer | `central.province@slsea.lk`  | Province 2   |
| Colombo District Officer | `colombo.district@slsea.lk`  | District 1   |
| Gampaha District Officer | `gampaha.district@slsea.lk`  | District 2   |
| Kandy District Officer   | `kandy.district@slsea.lk`    | District 4   |

POST `/v1/auth/tokens` with `{ "email", "password" }`. Send the returned
`access_token` as `Authorization: Bearer ...`. Staff receive `generation:read
account:manage`; devices receive only `readings:write` for their own site/meter.
Every staff-token request checks the current password version. A password change
or reset immediately revokes every old token belonging to the target user.

## API behavior

Hierarchy GETs expose provinces, their districts, district substations,
substation installations and atomic resources. Staff access stays inside their
jurisdiction; district users can read parent-province navigation metadata but
cannot read province aggregates. Devices cannot call these GETs.

Installation GETs support intersection filters `province_id`, `district_id`,
`substation_id`, reporting status and `include=last_known_reading`. Last-known
GET returns freshness and age; no history returns 404. Overview includes the
hierarchy, last reading and today's energy/peak/count; an empty site has a null
last reading. These values are derived, without cached last-value columns.

History GETs exist at `/v1/readings`, `/v1/installations/{siteId}/readings` and
the atomic timestamp suffix. Use ISO timestamps with `Z` or an offset; encode
`+` as `%2B`. `from` is inclusive and `to` exclusive. Root history defaults to
24 hours and caps windows at 31 days; it supports hierarchy/site filters. Sort
is `timestamp` or `-timestamp` (default descending), with stable meter ties.

Only a site's device may POST its readings. Strict input includes `timestamp`,
`power_Kw`, `cumulative_energy_Kwh` and `voltage`; site/meter identity comes from
the path/token. Limits are 30 days past to five minutes future, power 0 through
`MAX_POWER_KW`, voltage 150–300 and a nonnegative counter that does not fall
below its predecessor. Duplicate timestamps return 409. Success returns 201,
an absolute `Location`, ETag and the reading. Locks serialize competing writes.

Generation summaries exist at the caller-scoped root and province, district and
substation levels. They report fresh power, reporting counts and today's
positive cumulative-counter energy using a pre-midnight baseline or first-today
fallback. Results identify the scope, `as_of` and `Asia/Colombo` timezone.

Generation trends add an installation level and require `from`/`to`. Local
hour/day windows snap outward before checking the seven-day hourly or 92-day
daily caps. One scoped SQL LAG aggregate attributes positive counter deltas to
the later reading's bucket, with one hour of predecessor lookback. Resets add
zero energy but still count. Buckets are zero-filled and paginated; meta records
the effective window, interval and scope. Sort is `bucket_start` or its negative.

GET `/v1/users` lists manageable users: national callers manage provincial and
district users; provincial callers manage district users in their own province;
district callers get an empty collection. Same-level users are excluded. Atomic
GET permits self or a manageable target. All account routes require
`account:manage` and expose only public profile fields.

PATCH `/v1/users/me` requires exactly `current_password` and `new_password`;
wrong current returns 403, unchanged or invalid new password returns 400.
PATCH `/v1/users/{userId}` resets a manageable target with exactly `new_password`,
rejecting `current_password`; an own numeric ID follows the self-change rules.
New passwords require ten Unicode characters, a letter and a digit, and at most
72 UTF-8 bytes to avoid bcrypt truncation. Both return empty 204 responses.
Caller/target locks and a revocation recheck prevent concurrent old-token updates.

## HTTP and security contract

Collections return `data`, `pagination`, absolute `links` and a `Link` header.
Page size defaults to 50 and caps at 500. Empty lists have `total_pages: 0`;
out-of-range pages are empty. Name sorting uses stable ascending ID ties.
Forwarded protocol/host supply absolute URLs. Unknown fields and queries fail.

Strong ETags support empty 304 responses and 412 precondition failures after
authentication, validation and authorization. History/atomic-reading/last-known
GETs also support Last-Modified/If-Modified-Since; If-None-Match takes precedence.
Metadata, overview, summaries, trends and account GETs have no Last-Modified.

JSON is required except HTML Swagger. Errors share
`{ "error": { "code", "message", "status", "details", "request_id" } }`.
Malformed JSON returns 400, unsupported media/encoding 415 and unacceptable
representations 406. Oversized JSON (>10 KiB) maps to **400 VALIDATION_FAILED**,
following project.md's status/code table. Unsupported methods, including HEAD,
return 405 with exact Allow; configured CORS preflights are handled separately.

Helmet supplies HSTS and other headers, Swagger uses a CSP hash and pinned CDN,
and every response gets a fresh server-generated request ID. Logs omit submitted
input, tokens, passwords, hashes and secrets. Errors are non-cacheable; GETs vary
by Accept and Authorization. SQL binds values rather than concatenating input.

Rate limits default on: **600 requests/minute** globally, **30 login attempts
per 15 minutes**, and **10 password PATCH attempts per 15 minutes** shared across
both password routes. All attempts count. Keys use the proxy-resolved client IP
and IPv6 /56 grouping. Uniform 429 responses include Retry-After and draft-8
RateLimit/RateLimit-Policy headers, exposed through CORS. Memory counters are
per process and best effort on serverless instances; they reset on restart and
are not a distributed quota. Tests disable limiting except the dedicated test.

## Vercel owner checklist

- [ ] Select/create the intended Neon database and branch. This owner keeps the
      supplied existing target; no additional database or Docker is required.
- [ ] Set the private local pooled `DATABASE_URL`, direct `DIRECT_URL` and
      signing secret; run `npm run db:migrate` from the owner's machine.
- [ ] Run `npm run seed -- --yes`; retain `seed-output/device-tokens.json` privately.
- [ ] Connect the latest Git commit in Vercel. Framework **Other**, repository
      root directory, Node **24.x**, build `npm run build`, output **public**.
      The tracked `public/.gitkeep` retains the output directory.
- [ ] Add Production/Preview runtime settings: pooled `DATABASE_URL`, the same
      `JWT_SECRET`, `NODE_ENV=production`, exact frontend `CORS_ORIGINS` and
      `RATE_LIMIT_ENABLED=true`. Issuer/audience defaults must match local tools.
      Direct/test/seed variables are unnecessary in the deployed runtime.
- [ ] Deploy. Never migrate or seed during the Vercel build.
- [ ] Run `npm run seed:extend` before a demo.
- [ ] Verify `/health`, `/docs`, `/openapi.json`, login and a device POST through
      `simulate`; run `smoke` for the full demo checks. Use a publicly accessible
      deployment or the owner's authorized deployment-protection access.

`api/index.js` exports the app without a listener; only the local server listens.
`vercel.json` rewrites to that explicit function and bundles `openapi.json`.
The build generates Prisma's supported client and compiles it to JavaScript.
Runtime uses one pooled Prisma client per process. No runtime file writes occur.
`.vercelignore` excludes private credentials, generated device tokens, tests,
disclosure docs and blueprint files. Deployment remains an owner action.

## GitHub CI

In Repository Settings → Secrets and variables → Actions, create repository
secrets `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL`,
`TEST_ALLOW_SHARED_DATABASE` and `JWT_SECRET`. For this owner, both direct values
identify the same provided Neon target and the shared-test value is `yes`.
Use the same signing key as Vercel; paste secret values without dotenv quotes.

GitHub Actions and Vercel run in separate environments. Vercel's variables
configure the deployed API; Actions secrets configure the temporary CI runner
that tests the API against Neon and restores the demo seed. Vercel variables
are not automatically available to Actions. Missing Actions secrets do not
prevent the deployed API from running, but prevent database CI checks from passing.

CI uses Node 24, npm ci, build, lint, spec validation and the full tests. It
serializes runs against the shared database and restores the full seed after
the test step, including failures. There is no Docker service. Static checks
need no database; integration requires the private secrets. Do not run local
database tests while CI is using the shared target.

## Final verification record

On 2026-10-09, all 231 tests/29 suites passed, including the final invalid-client-
address regression. Invalid proxy addresses are rejected before the limiter can
log their raw values. Follow-up checks for non-cacheable errors, CORS rate-limit
headers and smoke cleanup also passed.
A fresh source export of the I10 implementation installed locked dependencies
and built without `.env` or generated files copied in. The Vercel entry imported
successfully with no listener and trust proxy 1. A separate Git clone was not run.

The full supplied Neon sequence was seed → simulate --all → seed:extend → smoke:
**240 created, zero failed/skipped**, extension **zero rows** (already current),
and **65 smoke checks**, including seven demo logins, real device 201, password
204, old-token revocation and restored demo password. The national seven-day
daily trend took **485 ms** and national 24-hour readings took **457 ms** over
22,921 readings. These are single local-HTTP measurements including
authentication and Neon round trips, rather than a production latency guarantee.

After these writes, the full seed was restored: 160,584 readings, the original
stale/empty fixtures, seven demo passwords and 240 verified regenerated tokens.
History intervals/monotonic counters and both history indexes were rechecked.

Remote GitHub CI has been verified for I10. The workflow is ready; the
owner is configured its private repository secrets.

See [docs/ai-disclosure.md](docs/ai-disclosure.md) for prompts, assumptions,
repairs and references.
