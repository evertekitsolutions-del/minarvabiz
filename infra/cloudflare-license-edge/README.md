# Minarva Biz License Edge

Cloudflare Workers front door for Minarva Biz public licensing/update endpoints.

## Purpose

This is a transition layer. Windows clients should depend on a stable Minarva-controlled edge URL, not directly on the current hosting provider.

Current migration state:

- `/api/health` is served natively by Cloudflare;
- `/api/update/manifest` is served directly from the signed immutable GitHub Release manifest;
- `/api/public-key` is served natively by Cloudflare from the already-public production Ed25519 verification key;
- malformed/invalid `/api/license/validate` requests are now rejected natively at the edge before any origin call; valid validation plus the remaining license mutation/signing paths still use the existing License Admin origin while secrets/database logic are migrated in later milestones.

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
        +--> current license origin (mutations/signing, transition)
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

Request bodies are bounded. Cookies and arbitrary inbound headers are not forwarded. The validation preflight only checks request shape/token presence/device-id format and never receives licensing database or signing secrets. The transition validation origin now independently enforces JSON-only requests, a 16 KiB body ceiling, a 600-per-15-minute IP bucket and a 60-per-15-minute device bucket so direct-origin calls cannot bypass basic resource-abuse protection. These limits leave headroom above the Windows client's one-minute entitlement refresh plus focus/visibility refreshes. The Worker still holds no license signing private key and no Supabase service-role key.

## Update resilience

`/api/update/manifest` no longer depends on the current License Admin origin. The edge reads the immutable GitHub Release manifest directly. The Windows updater still verifies the Ed25519 signature and installer SHA-256, so the edge cannot bypass the existing update trust chain.

## Zero-cost / future migration

The Worker uses the Cloudflare Free plan. The current upstream is temporary. In a later milestone, licensing logic can move to another free-compatible or Minarva-owned service while clients keep the same edge endpoint.
