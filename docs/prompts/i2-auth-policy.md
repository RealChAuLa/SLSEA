# I2 authentication and policy

Implement implementation_plan.md I2 against project.md sections 5.1–5.4 and 4.7.
Add strict login, current-user profile, bearer verification and password-version
revocation, token-type/scope gates, pure jurisdiction policy and hierarchy resolver.
Cover all seven seeded logins, invalid tokens, revocation, method guards, serializer
whitelists and the caller/target policy matrix. Keep public health/docs database-free.
Use the owner's supplied Neon database for database checks; do not use Docker.
Do not start I3 until I2 checks pass. Stop after I3 as the owner requested.
