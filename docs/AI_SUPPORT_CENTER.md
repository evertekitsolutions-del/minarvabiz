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

The OpenAI API key and Supabase service-role credential are server-side only and are never bundled into the Windows client or browser JavaScript.

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

The public support APIs reuse the persistent Supabase rate-limit RPC:

- chat: 8 requests/minute and 40/hour per IP + anonymous client identifier;
- support/feedback submissions: 20/day.

The anonymous client identifier is HMAC-hashed before storage or use as a rate-limit key.

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

Web support deployment:

- `OPENAI_API_KEY`
- `SUPPORT_RATE_LIMIT_SECRET` (32+ characters; `LICENSE_RATE_LIMIT_SECRET` can be used as a fallback)
- `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- optional `MINARVA_SUPPORT_AI_MODEL` (defaults to `gpt-5.6-luna`)

Windows production build:

- `VITE_SUPPORT_API_URL=https://minarvabiz-steel.vercel.app`

## Operational rule

The UI may be present while the AI endpoint is not configured, but the feature must not be marketed as operational 24/7 support until the production database migration, API key, service credentials, rate-limit secret and deployed endpoint have all been verified.
