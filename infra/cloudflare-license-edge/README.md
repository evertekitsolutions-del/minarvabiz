# Minarva Biz License Edge

Cloudflare Workers front door for Minarva Biz public licensing/update endpoints.

## Purpose

This is a transition layer. Windows clients should depend on a stable Minarva-controlled edge URL, not directly on the current hosting provider.

Current migration state:

- `/api/health` is served natively by Cloudflare;
- `/api/update/manifest` is served directly from the signed immutable GitHub Release manifest;
- `/api/public-key` is served natively by Cloudflare from the already-public production Ed25519 verification key;
- the complete `/api/license/validate` path is Cloudflare-native: request validation runs in the Worker and valid-shaped requests call one narrowly-scoped Supabase Postgres RPC directly; the RPC returns license state but does not issue a fresh activation certificate, so Windows keeps its already-verified stored certificate;
- `/api/license/deactivate` is also Cloudflare-native through a scoped Supabase RPC; it preserves the existing token/device/activation semantics and adds bounded abuse protection;
- `/api/trial/register` is Cloudflare-native through a scoped Supabase RPC with public CORS, uniqueness checks, and rate limits; no email provider is required in the zero-cost phase, so notifications remain marked `registered_email_pending`;
- `/api/license/activate` is Cloudflare-native through the scoped activation RPC. The Worker derives the Ed25519 signing authority from the existing encrypted `LICENSE_EDGE_RPC_SECRET` using a domain-separated SHA-256 KDF, so no additional signing secret or Render fallback is required;
- `GET /api/admin/auth-config` exposes only the deployment-configured Supabase URL, publishable key, and safe password-recovery URL required for browser-native administrator authentication;
- `GET /api/admin/emergency/status` exposes only safe emergency enable/configuration state for an allowlisted admin origin; it never returns actor identity, credential digests, or secrets;
- `POST /api/admin/emergency/login` accepts the plaintext emergency credential only at the Worker edge, hashes it with Web Crypto before the database RPC, derives stable salted rate/backoff keys from the connecting address, creates a cryptographically random bearer session token, and stores only that token's SHA-256 digest in PostgreSQL;
- `GET /api/admin/emergency/me` validates a short-lived emergency bearer session through the PostgreSQL authority bridge; `POST /api/admin/emergency/logout` revokes it and records logout audit;
- `GET /api/admin/emergency/control-status`, `POST /api/admin/emergency/rotate`, and `POST /api/admin/emergency/disable` are named-admin control routes. PostgreSQL requires Supabase TOTP AAL2 plus active role `admin`; rotate generates a 48-byte credential inside Cloudflare and returns it once while PostgreSQL receives only SHA-256;
- the normal `/api/admin/me`, license, support, offline activation and customer-provisioning routes now accept the same emergency bearer only through the dual-authority upstream boundary; named AAL2 behavior is unchanged and the Worker edge secret is never exposed to the browser;
- `GET /api/admin/bootstrap/status` exposes only whether first-admin bootstrap is still required and whether the deployment has bootstrap configuration; it never returns the configured bootstrap email/name or edge secret;
- `POST /api/admin/bootstrap/signup-reservation` rate-limits and serializes first-admin setup, keeps the one-time routing token inside Cloudflare, and creates the reserved Auth user with an unknown random credential so mailbox ownership controls the real password;
- `POST /api/admin/bootstrap/claim` is the AAL2 first-admin claim boundary. The Worker supplies the configured bootstrap email/name plus the Cloudflare-only edge secret, while Postgres verifies the signed user JWT, confirmed email, empty registry, identity isolation and a serialized first-claim lock;\n- `GET /api/admin/me`\n- `POST /api/admin/customers/provision`
- `GET /api/admin/licenses`
- `POST /api/admin/licenses`
- `POST /api/admin/licenses/offline-activation`
- `PATCH /api/admin/licenses/status`
- `GET /api/admin/support`
- `PATCH /api/admin/support` accepts a Supabase user JWT, requires MFA assurance level `aal2`, and returns an active allowlisted admin identity/role/permissions through a narrowly-scoped authenticated RPC;
- `GET /api/admin/licenses` is a read-only License Admin data route. It reuses the same MFA/allowlist/RBAC boundary, returns at most 200 license summaries plus activation summaries, and never returns license tokens or token hashes;
- `POST /api/admin/licenses` issues commercial licenses with the Cloudflare-derived Ed25519 authority. Plan features/device limits are validated both at the Worker and database boundary, and the database RPC additionally requires the Cloudflare-only edge secret before storing the signed token;
- `POST /api/admin/licenses/offline-activation` creates the existing device-bound `.lic` package format using atomic database activation plus a Cloudflare-signed activation certificate;
- `PATCH /api/admin/licenses/status` manages commercial license status through an admin-only transactional RPC. Non-active status changes deactivate active device activations and record both the license event and admin audit in the same transaction;
- `GET /api/admin/support` exposes the Support Inbox through the same `aal2` + active-admin + `support.read` authorization boundary;
- `PATCH /api/admin/support` updates status/assignment/admin notes through a transactional scoped RPC requiring `support.manage`. The update and immutable admin audit row are committed together. No Supabase service-role key is used.\n- `POST /api/admin/customers/provision` provisions a new online customer through Supabase Magic Link signup using only the publishable key. The Auth insert trigger creates exactly one organization/admin membership/HQ branch, and Cloudflare verifies that bootstrap before returning success.

This gives Minarva Biz a replaceable boundary:

```
Windows / web client
        |
        v
Cloudflare License Edge
        |
        +--> Cloudflare-native health
        |
        +--> immutable GitHub signed update manifest
        |
        +--> Cloudflare-native public verification key
        |
        +--> scoped Supabase RPC (validation + deactivation + trial + activation)
        |
        +--> Cloudflare-derived Ed25519 activation/update signing authority
        |
        +--> future Minarva-owned/self-hosted license API
```

Changing the origin later does not require changing the public client API contract.

## Security

The Worker is **not** an open proxy. Only these routes are accepted:

- `GET /api/health`
- `GET /api/public-key`
- `GET /api/update/manifest`
- `POST /api/license/activate`
- `POST /api/license/validate`
- `POST /api/license/deactivate`
- `POST /api/trial/register`
- `OPTIONS /api/trial/register`
- `GET /api/admin/me`

Request bodies are bounded. Cookies and arbitrary inbound headers are not forwarded. Native validation, deactivation, and trial registration accept JSON only and have a 16 KiB body ceiling. Validation enforces 600 requests per 15 minutes per IP plus 60 per 15 minutes per device. Deactivation enforces 60 per 15 minutes per IP plus 10 per 15 minutes per device. Trial registration enforces 10 per hour per IP plus 3 per day per device.

The Worker holds only the existing Cloudflare-only RPC secret and a Supabase publishable key. Deployment-configured Supabase/app origins are provider-neutral: any HTTPS origin is accepted, while plain HTTP is accepted only for loopback (`localhost`, `127.0.0.1`, `::1`) local verification; remote HTTP fails closed. Emergency admin routes additionally reject actual requests that do not carry an allowed `Origin`; status/login/me/logout/control routes are not usable as origin-agnostic public endpoints. Emergency enabled state and actor identity are PostgreSQL-owned; the Worker no longer needs emergency actor/enable environment bindings. Browser-admin CORS is restricted by the deployment-only `LICENSE_ADMIN_ALLOWED_ORIGINS` allowlist; production currently points that binding at the transitional License Admin origin and the binding can move with the UI. The signing authority is derived inside the Worker with domain separation; no standalone private signing secret is stored. The plaintext RPC secret is stored only as an encrypted Worker secret; the database stores only its SHA-256 hash in a non-exposed `license_private` schema. The RPC is `SECURITY DEFINER` with an empty search path, is revoked from `PUBLIC`, `authenticated` and `service_role`, and is granted only to `anon` because the Cloudflare-only secret is the additional server-to-server authorization factor. Direct table access remains denied by RLS. The Worker never exposes the derived private key and never needs a Supabase service-role/secret key. `/api/public-key` exposes only the derived raw Ed25519 public key. The same authority signs activation certificates and update manifests.

## Update resilience

`/api/update/manifest` no longer depends on the current License Admin origin. The edge reads the immutable GitHub Release manifest directly. The Windows updater still verifies the Ed25519 signature and installer SHA-256, so the edge cannot bypass the existing update trust chain.

## Zero-cost / future migration

The Worker uses the Cloudflare Free plan. Customer-facing licensing/update compute is fully on Cloudflare. License Admin named-user password/TOTP authentication runs browser -> Supabase Auth and normal named-admin operations run browser -> Cloudflare directly. Legacy server sessions remain rollback-only until live production parity is proven. Browser emergency sign-in already uses Cloudflare directly, and the self-service control API removes any requirement to migrate the old Render emergency credential: a named AAL2 admin can create/rotate/disable the replacement authority without exposing raw secrets to PostgreSQL or Cloudflare configuration. First-admin bootstrap is browser-native: Cloudflare/Postgres owns status, signup reservation/account creation and the AAL2 claim boundary; Supabase Auth supplies mailbox confirmation, password recovery/setup and TOTP. The retained legacy privileged bootstrap helper remains transitional only until the safe fresh-instance end-to-end proof is complete. Supabase remains PostgreSQL/Auth, and GitHub remains source plus Windows release storage. The stable public edge endpoint remains unchanged and can later point at Minarva-owned infrastructure.
