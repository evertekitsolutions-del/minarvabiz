# PLT-005 / PLT-007 — Financial Sync Device Authority

**Draft source only. Production migration, release and actual financial cloud sync are NOT enabled.**

Admin/super-admin authenticated RPCs enroll a device with immutable UUID/label/public-key SHA-256 digest, grant/revoke live org-owned branches, and revoke a device together with its branch grants. All requests derive the sole org from the authenticated session and membership. Table SELECT/INSERT/UPDATE/DELETE are revoked and FORCE RLS is enabled with no client policies; management is exclusively through restricted administrative RPCs. Replayed identical enrollment is allowed, tampered/revoked IDs reject. All grants are default OFF.

**Critical:** the public-key hash is not proof of private-key possession. These administrative RPCs do NOT permit financial sync. A future transactional financial RPC MUST independently verify authenticated actor, current company authority, branch/warehouse scopes, cryptographic device signature or possession challenge, signed command digest, idempotency, and ledger/stock invariants before accepting data. No production deployment without owner approval and independent security review.

See issue #325 and SAL-003 draft PR #568.

## Host-side signed device challenge guard
`packages/business-logic/src/sync-device.ts` adds a strict default-OFF boundary requiring host-derived actor membership/finance role, company and warehouse grants, an active enrolled device and branch grant, matching digest/device/actor/operation, a 5-minute challenge window and a privileged cryptographic/one-use-nonce callback that must return literal `true`. This guard does not implement signature verification, nonce storage or upload RPC itself, and must not be called with renderer-supplied callbacks. Negative tests reject revoked devices, cross-tenant or company scope, malformed signatures and stale time windows. Actual cryptographic verifier and company authority remain blocking prerequisites.

**Concurrent revocation safety:** device grants now acquire a database row lock on the active device before mutation, serialized with the revocation UPDATE. Grant-on then revoke cannot leave an active grant; revoke then grant fails closed. Enrollment labels reject control characters. Isolated PostgreSQL tests cover disable/re-enable and malformed labels.
