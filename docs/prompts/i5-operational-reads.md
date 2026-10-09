# I5 operational reads

Implement implementation_plan.md I5 against project.md 3.3–3.4, 4.5 and 6.5.
Add Asia/Colombo day/hour helpers, authorized last-known and overview GETs,
clock-injected freshness, today energy with previous-day baseline or first-reading
fallback. Add reporting filters before count/pagination and one-query page-only
last-known includes on both installation list routes. Use DISTINCT ON and fixed,
parameterized SQL with scope predicates, no per-item queries. Test stale/empty
fixtures, exact freshness boundary, today baselines, scope/conditional precedence,
strict options, pagination and constant Prisma query counts as page size grows.
Use supplied Neon without Docker; restore full dataset and stop before I6.
