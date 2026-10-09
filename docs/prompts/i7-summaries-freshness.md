# I7 summaries and freshness

Implement I7 from implementation_plan.md using project.md 3.5, 5.3 and 6.6.
Resolve caller and addressed region scopes with jurisdiction checks; use one
parameterized SQL aggregate for reporting/latest power and Asia/Colombo today
energy, converting numeric results. Add four summary GETs with ordered
conditionals and Last-Modified as_of. Add bounded, idempotent seed:extend using
the shared generator and stored counters, excluding offline/empty fixtures.
Test hand-computed baselines/fallbacks, old baselines, every scope level, district
metadata navigation versus province aggregates, zero regions, overview energy
consistency, single aggregation query, continuation and concurrent extension.
Project baseline rules take precedence over the plan's sample baseline cutoff.
Use supplied Neon without Docker; restore full data and stop before I8.
