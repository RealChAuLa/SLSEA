# I3 hierarchy read path

Implement implementation_plan.md I3 using project.md sections 3.1–3.2, 4.2–4.5
and 5.3. Add every I3 hierarchy GET, public serializers, strict path/query checks,
jurisdiction-intersected list predicates, parent authorization, narrowing filters,
transactional counts/pages, forwarded-origin pagination links, deterministic sort
and RFC 9110 ETag preconditions evaluated after authentication and authorization.
Test every caller and endpoint for visibility/leakage, empty/contradictory filters,
pagination boundaries, method guards, device denial, query strictness and conditional
precedence. Use provided Neon; no local DB/Docker. Restore full seed after checks.
Stop after I3; do not implement I4 history or I5 operational options.
