# Minarva Biz AI Support Center

## Purpose

The Support Center gives customers two clear paths inside Minarva Biz:

1. **AI Technical Support** — 24/7 product guidance for Minarva Biz, including screenshot analysis for visible errors and UI problems.
2. **Ideas & Feature Requests** — structured product feedback that is stored in the private admin Support Inbox.

Technical conversations can also be escalated to the Support Inbox for human review.

## Architecture

- Shared customer UI: `packages/ui/src/components/support/SupportCenter.tsx`
- Online API: `apps/web/src/app/api/support/*`
- Server support logic: `apps/web/src/lib/support-server.ts`
- Admin inbox: `apps/license-admin/src/app/admin-panel/SupportInboxCard.tsx`
- Database: `public.support_requests`
- Windows client: calls the production web support API over HTTPS.
- Online client: calls the same API locally through the web deployment.

Production uses a **provider-neutral AI adapter**. During the zero-cost phase, Minarva Biz prefers a Cloudflare Workers AI endpoint protected by the same short-lived Vercel OIDC identity already used by the support backend.

The private Supabase `support_runtime_config` table selects the active AI endpoint. This lets Minarva Biz move from Cloudflare to a future self-hosted inference server without changing the Windows client or customer Support Center UI.

Database writes, runtime routing and persistent rate limiting are delegated to the Supabase Edge Function `minarva-support-broker`. That broker validates the Vercel OIDC issuer, audience, production subject, team ID and project ID before using Supabase's built-in service-role credential. The service-role credential never leaves Supabase and is never bundled into the Windows client, browser JavaScript or Vercel project settings.

## Knowledge freshness

Technical answers are grounded with a small retrieval layer that refreshes from the current Minarva Biz repository:

- selected product/runbook documentation;
- the latest GitHub release metadata;
- recent commits on `main`.

The cache is short-lived, so normal releases and documented product changes become available to the support assistant without shipping a separate hard-coded FAQ database.

Important product behavior must still be documented in the repository. The assistant is explicitly told not to invent unsupported menu names, releases or fixes.

## Screenshot handling

Supported formats: PNG, JPEG and WebP.

The client resizes/re-encodes large screenshots before upload. Screenshots are sent only with the current support request to the AI provider for analysis. The current implementation **does not persist raw screenshot bytes** in `support_requests`; only an optional AI-generated text summary can be retained.

Customers are warned not to upload passwords, license tokens, payment-card data or unnecessary customer-sensitive information.


## AI provider privacy

The zero-cost production path uses **Cloudflare Workers AI directly through a Workers AI binding**, not a third-party paid model routed through AI Gateway. Cloudflare documents Workers AI inputs/outputs as Customer Content and states that it does not use that content to train Workers AI models or improve Cloudflare/third-party services without explicit consent.

The Minarva Biz Worker does not persist prompts, screenshots or responses. Raw screenshots remain request-scoped and are not written to the Support Inbox.

Paid AI fallback is disabled by default. The legacy Vercel AI Gateway/OpenAI code path can run only when a future operator explicitly sets `MINARVA_ALLOW_PAID_AI_FALLBACK=true`. Until the 25-customer review, that flag must remain disabled.

## Redacted diagnostics

The customer can explicitly opt in to sharing a redacted diagnostics object. It contains operational facts such as:

- app version and edition;
- platform;
- online state;
- SQLite file presence;
- backup counts/latest verified backup timestamp;
- license state/plan/remaining days.

It intentionally excludes customer records, database contents, license tokens and device IDs.

## Rate and cost controls

The Vercel API forwards the request to the OIDC-authenticated Supabase support broker, which applies the persistent Supabase rate-limit RPC:

- chat: 8 requests/minute and 40/hour per network origin;
- support/feedback submissions: 20/day.

The broker HMAC-hashes the network address with a secret that exists only inside the Supabase runtime before using it as a rate-limit key. The raw address is not stored. A separate anonymous client identifier is also HMAC-hashed before it is stored with a support request.


## Saved support-data retention

Ordinary AI chat is not written to the Support Inbox automatically. A transcript is persisted only when the customer explicitly escalates the conversation or submits a support/feature request.

For persisted Support Inbox records:

- open / in-review / planned requests are retained while work is active;
- resolved / rejected / duplicate requests are automatically eligible for permanent purge after **180 days**;
- the broker performs opportunistic retention cleanup during readiness checks and new submissions;
- raw screenshots are never stored in the Support Inbox;
- AI summaries, screenshot text summaries, saved transcripts, hashed client identifiers, admin notes and contact details are deleted with the support record when the retention purge runs.

If a legal, contractual or customer-specific retention requirement differs from this default, change the broker retention policy before deployment and document the applicable period.

## Admin Support Inbox

Authorized License Admin users can review:

- AI technical escalations;
- bug reports;
- feature requests;
- workflow/convenience suggestions.

Records include app version, module, edition, AI triage summary, optional transcript, status, owner and internal notes.

Roles:
- Viewer: read-only Support Inbox.
- Operator/Admin: read and manage requests.

## Required production environment

The zero-cost production path is designed to require **no OpenAI API key and no paid AI account**.

Existing values:

- request-bound Vercel OIDC identity;
- `NEXT_PUBLIC_SUPABASE_URL`;
- Supabase Edge Function built-ins: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

AI provider routing comes from the private `public.support_runtime_config` row `ai_provider`. The Cloudflare endpoint is stored there after the one-time Worker deployment; no Windows build change is needed.

Optional development/future migration values:

- `MINARVA_FREE_AI_URL` — local/operator override for the free/self-hosted AI endpoint;
- `MINARVA_FREE_AI_TEXT_MODEL`;
- `MINARVA_FREE_AI_VISION_MODEL`;
- `MINARVA_ALLOW_PAID_AI_FALLBACK=true` — explicit future opt-in only;
- `AI_GATEWAY_API_KEY`, `OPENAI_API_KEY`, `MINARVA_SUPPORT_AI_MODEL` — ignored for production fallback unless paid fallback has explicitly been enabled.

Windows production build:

- `VITE_SUPPORT_API_URL=https://minarvabiz-steel.vercel.app`

The pre-25-customer policy requires `MINARVA_ALLOW_PAID_AI_FALLBACK` to stay unset/false. Reaching a free quota must degrade to Help Center + Support Inbox rather than create a charge.

## OIDC request flow and broker deployment

For Vercel-hosted support API requests, the server reads the current request-bound `x-vercel-oidc-token` injected by Vercel. It forwards that token to `minarva-support-broker` and, when enabled, to the Cloudflare AI Worker as `Authorization: Bearer <token>`.

The Cloudflare Worker independently validates the RSA signature, issuer, audience, exact production subject, team ID, project ID/name, environment and token lifetime before any Workers AI inference is run. No long-lived shared secret is stored in the Windows app or browser.

The broker validates:

- issuer;
- Vercel team audience;
- exact production subject;
- owner/team ID;
- project ID and project name;
- production environment claim.

The Supabase function must be deployed with Supabase JWT verification disabled because the incoming bearer token is a **Vercel OIDC token**, not a Supabase Auth JWT. The broker performs its own signature and claim verification with Vercel's JWKS.

CLI equivalent:

```bash
supabase functions deploy minarva-support-broker --no-verify-jwt
```

Do not change this to a publicly trusted unauthenticated broker: `verify_jwt=false` is safe here only because the function itself rejects any request that fails the Vercel OIDC checks.

## Operational readiness

`GET /api/support/health` is an operational probe, not just a configuration check. It verifies:

- private runtime AI routing can be read;
- the configured free/self-hosted provider endpoint is enabled;
- a real text + synthetic image request can reach the configured AI model;
- Support Inbox database reads succeed;
- the persistent rate-limit RPC succeeds;
- a synthetic Support Inbox row can be inserted and immediately deleted;
- retention cleanup can run.

The live AI probe is intentionally tiny and the result is cached briefly (longer after success, shorter after failure). Provider URLs, billing links, API keys and raw provider error bodies are not returned to customers.

`ready: true` is returned only when all required AI, broker, database, rate-limit, submission and retention checks pass. A configured credential by itself is **not** considered operational readiness.

A customer-facing support submission must additionally be observed reaching the private Support Inbox before a new deployment is declared fully verified. Authorized Admin Inbox viewing remains subject to the normal License Admin authentication and `support.read` / `support.manage` permissions.
