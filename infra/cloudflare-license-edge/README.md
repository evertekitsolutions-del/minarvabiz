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
- `GET /api/admin/me`\n- `POST /api/admin/customers/provision`
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

The Worker holds only the existing Cloudflare-only RPC secret and a Supabase publishable key. The signing authority is derived inside the Worker with domain separation; no standalone private signing secret is stored. The plaintext RPC secret is stored only as an encrypted Worker secret; the database stores only its SHA-256 hash in a non-exposed `license_private` schema. The RPC is `SECURITY DEFINER` with an empty search path, is revoked from `PUBLIC`, `authenticated` and `service_role`, and is granted only to `anon` because the Cloudflare-only secret is the additional server-to-server authorization factor. Direct table access remains denied by RLS. The Worker never exposes the derived private key and never needs a Supabase service-role/secret key. `/api/public-key` exposes only the derived raw Ed25519 public key. The same authority signs activation certificates and update manifests.

## Update resilience

`/api/update/manifest` no longer depends on the current License Admin origin. The edge reads the immutable GitHub Release manifest directly. The Windows updater still verifies the Ed25519 signature and installer SHA-256, so the edge cannot bypass the existing update trust chain.

## Zero-cost / future migration

The Worker uses the Cloudflare Free plan. Customer-facing licensing/update compute is fully on Cloudflare. License Admin migration now also starts at the same edge boundary with user-JWT + MFA authorization. Supabase remains PostgreSQL/Auth, and GitHub remains source plus Windows release storage. The stable public edge endpoint remains unchanged and can later point at Minarva-owned infrastructure.
