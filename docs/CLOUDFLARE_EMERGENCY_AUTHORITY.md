# Cloudflare / Self-host Emergency Authority Foundation

This milestone preserves License Admin emergency break-glass access while creating a provider-portable authority boundary for migration away from the transitional Next/Render server path.

## Foundation scope

This is additive. It does not cut over the UI and does not remove the existing emergency server actions.

The PostgreSQL bridge provides:

- private edge-secret validation through the existing `license_private.edge_credentials` authority;
- a private emergency-credential registry containing only SHA-256 digests for the current and optional previous high-entropy credential;
- a maximum 24-hour grace window for the previous credential;
- one atomic emergency-login RPC that performs rate limiting, progressive backoff, credential-digest verification, audit, and session creation;
- admin-only emergency sessions with a maximum 15-minute lifetime;
- random bearer-session tokens represented at rest only by SHA-256 digests;
- session validation and last-seen updates;
- explicit revocation/logout;
- successful and denied login plus logout audit records.

The browser must send the plaintext emergency credential only to the trusted edge. The edge hashes it before calling PostgreSQL. PostgreSQL therefore does not receive or store the plaintext credential.

A generic Cloudflare edge RPC secret is **not sufficient** to mint an emergency session: the login RPC also requires a digest matching the private current/previous emergency credential registry. This preserves defense in depth if one infrastructure credential is exposed.

## Portability and dependency policy

No paid service or new runtime dependency is introduced.

The implementation uses PostgreSQL/Supabase primitives already present in Minarva Biz. Cloudflare's current Workers documentation confirms encrypted Worker secrets, Web Crypto support, secure random generation, SHA-256/HMAC support, and constant-time comparison guidance. The Worker cutover should prefer standard Web Crypto primitives where practical so the same contract remains portable to self-hosted edge runtimes.

Primary business data and emergency audit/session state remain PostgreSQL-backed rather than trapped in provider-specific storage.

## Credential rotation

The private registry supports two slots:

- `current`: active credential digest with no expiry;
- `previous`: optional, distinct credential digest with an explicit grace expiry, bounded to at most 24 hours from creation. Rotation should replace this row rather than extend an old grace window.

The future Worker cutover must synchronize the private digests with the currently configured emergency credential before traffic moves. The existing Next/Render emergency path remains authoritative until that migration and parity E2E are complete.

## Legacy zero-secret-exposure synchronization

During the transitional Render phase, the existing server remains the source of the raw emergency credential environment variables. Minarva does not need to read, export, or copy those raw values into Cloudflare.

Before each License Admin production server start, `apps/license-admin/scripts/sync-emergency-authority.mjs`:

- validates the existing current credential and named emergency actor locally;
- applies the same maximum 24-hour previous-credential grace already enforced by the legacy verifier;
- hashes current/active-previous credentials with SHA-256 inside the Render process;
- sends only those digests plus safe enable/actor metadata to a service-role-only PostgreSQL RPC;
- mirrors the private digest registry idempotently and records an audit event only when authority state changes;
- safely skips without deleting a valid current authority if required legacy configuration is absent or invalid;
- fails open only with respect to starting the **legacy** License Admin server, so a synchronization outage cannot remove existing break-glass availability. Cloudflare cutover remains disabled until the synchronized state is separately verified.

The sync RPC is not executable by `anon` or `authenticated`, and the private credential/runtime-config tables remain unreadable to browser roles and service-role direct table access.

## Browser emergency cutover

The License Admin client now supports emergency access without creating a privileged Next.js server session:

- the browser sends the emergency credential directly to the Cloudflare emergency login route;
- Cloudflare returns only a short-lived revocable bearer token plus the emergency identity and expiry;
- the token is validated client-side and stored only in `sessionStorage`, never `localStorage` or a persistent cookie;
- the shared browser admin API uses either the named administrator AAL2 token or the emergency bearer, never both;
- switching authority clears the other browser session;
- browser logout revokes the emergency bearer at Cloudflare before/while clearing local tab state;
- a restored emergency browser session is re-authorized through the generic Cloudflare `/api/admin/me` and business routes.

The historical Next/Render emergency cookie path remains temporarily available as rollback-only compatibility during deployment cutover. It is no longer used by the normal emergency sign-in interaction in the browser. Removal is deferred until production hosting/origin configuration and browser runtime verification are complete.

## Full emergency business-operation parity

Emergency cutover is not complete if it can only authenticate. A valid emergency session must retain the same operational admin capability that the legacy break-glass path provides.

The Cloudflare/PostgreSQL boundary therefore supports a **dual administrator authority**:

- named administrators: Supabase Auth + TOTP AAL2 + active allowlisted identity;
- emergency administrators: Worker-only edge secret + SHA-256 digest of a live, unrevoked emergency bearer session + synchronized enabled emergency runtime identity.

The same existing admin business RPC implementations are reused for both authorities. Emergency business requests are sent by the Worker with the public Supabase key plus two private upstream headers containing the Worker edge secret and the emergency session-token digest. The browser never receives either upstream proof.

Direct anonymous PostgREST calls remain unauthorized unless both proofs validate. Emergency bearer requests are additionally rejected by the Worker when the browser Origin is not in the License Admin allowlist or when emergency access is disabled.

Emergency-authorized audit rows are normalized at the database boundary so the real emergency session ID and `source='emergency'` are retained even though the shared business RPC implementation is reused.

Fresh-instance Worker E2E covers:

- generic `/api/admin/me` with an emergency bearer;
- license registry read, commercial issuance, status management and offline activation;
- support inbox read/update;
- online customer provisioning;
- strict Origin enforcement and disabled-state rejection;
- direct PostgREST bypass attempts without Worker proof;
- emergency session revocation;
- audit source/session correctness.

## Security invariants

Emergency access must remain:

- disabled by default at the edge configuration layer;
- bound to a named emergency actor;
- protected by a strong current credential and optional bounded previous-credential grace;
- protected by both coarse rate limiting and progressive backoff;
- admin-role only;
- short-lived, with a 15-minute maximum session;
- server-revocable;
- fail-closed when edge/database authority is unavailable;
- audited for denied login, successful login, and logout;
- free of plaintext emergency credentials and plaintext session tokens at rest;
- resistant to an edge-RPC-secret-only bypass.

The existing Next/Render emergency path must not be removed until the Worker/browser replacement proves these invariants end to end.
