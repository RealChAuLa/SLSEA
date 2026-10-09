# I1 scope prompt

User instruction (verbatim):

> okay lets start I1 , dont check the phase is done correctly untill i tell you to
>
> this is Database related text that i got for your reference

The reference describes a Neon CLI setup for project
`summer-thunder-32230894`, branch `production`, and includes a PostgreSQL pooled
connection credential. The credential is deliberately omitted from this saved
prompt and all tracked files; it belongs only in the ignored local `.env`.
The quoted CLI recipe is reference material, not an instruction to deploy.

Implementation scope:

Write I1 Data layer from implementation_plan.md, following project.md §§2.3–2.6,
5.1, 5.4, 6.1–6.4, 6.7–6.9, 7, and 10. Add Prisma schema, schema-derived initial
migration and hand-written CHECK migration, runtime singleton, token/password
utilities, pure deterministic reference/test builders, confirmation-protected
seed, sequence resets, token regeneration, and an isolated test database helper.
Write unit/integration tests but do not run them or the phase-completion gates.
Generate the client and initial SQL as construction artifacts without connecting
to Neon. Do not run owner migrations/seed, Neon deployment, or start I2. Keep I1
unverified until the owner's explicit request.
