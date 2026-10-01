# Minarva Biz License Edge

Cloudflare Workers front door for Minarva Biz public licensing/update endpoints.

## Purpose

This is a transition layer. Windows clients should depend on a stable Minarva-controlled edge URL, not directly on the current hosting provider. The initial origin remains the existing License Admin service while signing/database logic is migrated in later milestones.

This gives Minarva Biz a replaceable boundary:

```
Windows / web client
        |
        v
Cloudflare License Edge
        |
        +--> current license origin (transition)
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

Request bodies are bounded. Cookies and arbitrary inbound headers are not forwarded. The Worker holds no license signing private key and no Supabase service-role key.

## Update resilience

If the current origin cannot return `/api/update/manifest`, the edge falls back to the immutable GitHub Release manifest. The Windows updater still verifies the Ed25519 signature and installer SHA-256, so the fallback cannot bypass the existing update trust chain.

## Zero-cost / future migration

The Worker uses the Cloudflare Free plan. The current upstream is temporary. In a later milestone, licensing logic can move to another free-compatible or Minarva-owned service while clients keep the same edge endpoint.
