# I10 hardening and completion

Finalize I10 from implementation_plan.md against project.md 5.6 and 8–11.
Add express-rate-limit with enabled-by-default config, tight login/password and
loose global limits, uniform 429 errors and headers. Preserve project.md's 400
VALIDATION_FAILED mapping for oversized JSON. Audit serializers/logs, generate
every undeclared-method check from YAML, and enforce bidirectional router/spec
parity and documented errors. Add an HTTP smoke CLI with each role, hierarchy,
history, summary/trend, conditional reads, ingestion and reversible self-change.
Complete deployment exclusions, clean-checkout build verification, README/env
and AI records. Run full tests and final seed/simulate-all/extend/smoke against
the owner's supplied Neon database only; no Docker or extra database. Preserve
the deployed app's data and demo credentials after checks. Record heavy-query
timings and distinguish local gates from remote CI/deployment evidence.
