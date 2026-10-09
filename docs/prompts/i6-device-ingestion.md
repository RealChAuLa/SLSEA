# I6 device ingestion

Implement I6 from implementation_plan.md using project.md sections 4.6, 5.1–5.2,
5.4 and 6.7. Add strict reading-body validation, device-only scoped ingestion,
site/meter ownership checks, duplicate handling, nearest-earlier counter
validation, 201 with canonical Location/body/ETag, and the local HTTP simulator
using private device credentials and the shared generator. Test auth, identity,
all validation bounds, strict fields, concurrent duplicates and real HTTP
simulation. Use the supplied Neon database without Docker. Complete I6 checks
before starting authorized I7; stop before I8.
