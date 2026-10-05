# Cloudflare / Self-host Emergency Authority Foundation

This milestone preserves License Admin emergency break-glass access while creating a provider-portable authority boundary for migration away from the transitional Next/Render server path.

## Foundation scope

This is additive. It does not cut over the UI and does not remove the existing emergency server actions.

The PostgreSQL bridge provides:

- private edge-secret validation through the existing `license_private.edge_credentials` authority;
- persistent coarse login rate limiting;
- persistent progressive login backoff;
- failed-login audit records;
- admin-only emergency sessions with a maximum 15-minute lifetime;
- random bearer-session tokens represented at rest only by SHA-256 digests;
- session validation and last-seen updates;
- explicit revocation/logout;
- successful login/logout audit records.

The future Worker layer remains responsible for verifying the plaintext current/previous emergency credential. The database bridge never receives or stores that credential.

## Portability and dependency policy

No paid service or new runtime dependency is introduced.

The implementation uses PostgreSQL/Supabase primitives already present in Minarva Biz. Cloudflare's current Workers documentation confirms encrypted Worker secrets, Web Crypto support, secure random generation, SHA-256/HMAC support, and constant-time secret-comparison guidance. Where practical, the Worker cutover should prefer standard Web Crypto primitives so the same contract remains portable to self-hosted edge runtimes.

Primary business data and emergency audit/session state remain PostgreSQL-backed rather than trapped in provider-specific storage.

## Security invariants

Emergency access must remain:

- disabled by default at the edge configuration layer;
- bound to a named emergency actor;
- protected by strong current/previous credentials with bounded rotation grace;
- protected by both coarse rate limiting and progressive backoff;
- admin-role only;
- short-lived, with a 15-minute maximum session;
- server-revocable;
- fail-closed when edge/database authority is unavailable;
- audited for denied login, successful login, and logout;
- free of plaintext session tokens at rest.

The existing Next/Render emergency path must not be removed until the Worker/browser replacement proves these invariants end to end.
