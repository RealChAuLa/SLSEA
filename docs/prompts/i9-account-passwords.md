# I9 account and password management

Implement I9 from implementation_plan.md using project.md 4.6 and 5.4–5.5.
Add pure strict-level/jurisdiction management policy, manageable-user collections
and self/managed atomic GETs. Register /users/me before the numeric route. Add
strict self-change versus reset bodies, password policy and bcrypt byte limit,
wrong-current and same-password failures, 204 updates and password-version token
revocation. Numeric self target follows /me exactly. Test reset matrix, profile
visibility, no hashes, invalid bodies/passwords, login/revocation and concurrent
self changes. Keep rate limiting for I10. Use supplied Neon without Docker,
restore full data/demo passwords and stop before I10.
