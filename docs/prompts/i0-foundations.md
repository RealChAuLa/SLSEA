# I0 request and implementation prompt

User request (verbatim):

> let build the I0 "I0["I0 Foundations"]" from [implementation_plan.md](implementation_plan.md) , use [project.md](project.md) for Project details
>
> at the end check everythings ok , dont continue to next phase untill i tell you to

Implementation scope derived from that request:

Implement only I0 Foundations in implementation_plan.md, using project.md
sections 4.1–4.3, 4.7, 7, 8, 10, and 11. Write the OpenAPI contract and failing
tests first, then an exportable Express app, validated config, request context,
security/CORS/negotiation, one error handler, 404/405 plumbing, health and docs,
local/Vercel entry points, quality tooling, CI, README, and disclosure. Review
against the blueprint pitfalls and run all gates plus a local server smoke check.
Leave database/seed/auth/domain implementations for their designated increments.
Stop after I0; do not deploy or push to the owner's services.
