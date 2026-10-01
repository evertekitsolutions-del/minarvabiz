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

Production uses **Vercel OIDC** instead of a manually stored OpenAI API key. The Vercel serverless route authenticates to Vercel AI Gateway with the automatically issued `VERCEL_OIDC_TOKEN`.

Database writes and persistent rate limiting are delegated to the Supabase Edge Function `minarva-support-broker`. That broker validates the Vercel OIDC issuer, audience, production subject, team ID and project ID before using Supabase's built-in service-role credential. The service-role credential never leaves Supabase and is never bundled into the Windows client, browser JavaScript or Vercel project settings.

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

Production is designed to require **no manual OpenAI API key, Supabase service-role key, or custom rate-limit secret in Vercel**.

Automatically provided / existing values:

- `VERCEL_OIDC_TOKEN` — automatically issued by Vercel at runtime;
- `NEXT_PUBLIC_SUPABASE_URL` — already used by the Minarva Biz web application;
- Supabase Edge Function built-ins: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

Optional local-development fallbacks:

- `AI_GATEWAY_API_KEY` — for running AI Gateway outside a Vercel deployment;
- `OPENAI_API_KEY` — direct OpenAI fallback for local development;
- `MINARVA_SUPPORT_AI_MODEL` — defaults to `openai/gpt-5.4-mini`.

Windows production build:

- `VITE_SUPPORT_API_URL=https://minarvabiz-steel.vercel.app`

## Operational rule

The feature is considered operational only after the production support broker is deployed, the Vercel production health endpoint reports `ready: true`, a real AI chat request succeeds, and a real support submission reaches the private admin Support Inbox.
