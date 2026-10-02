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
- `/api/license/activate` is cutover-ready in the Worker. The Worker first verifies that an optional `LICENSE_PRIVATE_KEY` secret can produce signatures accepted by the already-shipped production public key. If that exact existing key is present, activation runs Cloudflare-native through a scoped Supabase RPC and signs the device certificate at the edge. If the secret is absent or does not match, activation safely stays on the transition origin; no new key is generated automatically.

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
        +--> scoped Supabase RPC (validation + deactivation + trial + activation-ready)
        |
        +--> Ed25519 activation signing in Cloudflare when the existing key is configured
        |
        +--> current license origin (activation fallback + admin signing, transition)
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

Request bodies are bounded. Cookies and arbitrary inbound headers are not forwarded. Native validation, deactivation, and trial registration accept JSON only and have a 16 KiB body ceiling. Validation enforces 600 requests per 15 minutes per IP plus 60 per 15 minutes per device. Deactivation enforces 60 per 15 minutes per IP plus 10 per 15 minutes per device. Trial registration enforces 10 per hour per IP plus 3 per day per device.

The Worker holds a Cloudflare-only RPC secret and a Supabase publishable key. The code also supports an optional encrypted `LICENSE_PRIVATE_KEY` secret solely for the activation cutover. The plaintext RPC secret is stored only as an encrypted Worker secret; the database stores only its SHA-256 hash in a non-exposed `license_private` schema. The RPC is `SECURITY DEFINER` with an empty search path, is revoked from `PUBLIC`, `authenticated` and `service_role`, and is granted only to `anon` because the Cloudflare-only secret is the additional server-to-server authorization factor. Direct table access remains denied by RLS. Until the explicit cutover, production can keep the signing secret absent and activation falls back safely. When the existing production signing seed is transferred, the Worker cryptographically proves it matches the fixed production public key before any native activation database mutation. The Worker never needs a Supabase service-role/secret key.

## Update resilience

`/api/update/manifest` no longer depends on the current License Admin origin. The edge reads the immutable GitHub Release manifest directly. The Windows updater still verifies the Ed25519 signature and installer SHA-256, so the edge cannot bypass the existing update trust chain.

## Zero-cost / future migration

The Worker uses the Cloudflare Free plan. The consolidation target is Cloudflare for public/server compute, Supabase only for PostgreSQL/Auth, and GitHub only for source plus signed Windows releases. The remaining transition origin routes are being removed one small milestone at a time so existing licenses are not broken. The stable public edge endpoint remains unchanged and can later point at Minarva-owned infrastructure.
