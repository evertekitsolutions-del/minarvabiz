# OWNER DIRECTIVE — Minarva Biz ONLINE SaaS + Mobile ONLY
**Effective:** 2026-11-09
**Authority:** Owner binding override; supersedes any earlier repository plan, agent prompt, backlog ordering or CI scope claiming that offline/Windows/Hybrid must still be developed.

## Permanent product scope
- Minarva Biz is now **online-only, multi-tenant SaaS** accessible through browser and mobile application; not a temporary boutique-only delivery exception. All industry modules remain in scope through the online platform.
- **Stop and do not resume** Windows Offline/Electron installers, local SQLite POS, hybrid/offline data synchronization, desktop packaging, release engineering and desktop-focused test enhancement. Do not schedule Windows release publication.
- **Do not remove, reset, mutate or delete** any historical customer Electron profiles, SQLite images, backups, license records, forensic incident evidence or old published releases. Preserve for separately authorized recovery/legal support. Archived source may remain in repo read-only while functionality is safely migrated.
- Mobile: start with a responsive, installable PWA sharing the authenticated SaaS data model. Native Android packaging can follow if required, after testing; a responsive browser screenshot alone does not prove a mobile app.

## Commercial customer journey (mandatory end-to-end)
**Main customer-facing website -> Register -> Select subscription/trial -> Verify account -> Safely provision tenant -> Generate tenant-specific login link -> Login -> Authorized ERP Dashboard -> Use on mobile.**
- A per-customer login URL is a route/locator, **never** a bearer credential or guessed access token. Authentication and tenant membership must be verified server-side every time.
- Separate subscription lifecycle (trial, payment-pending, active, expired, canceled, grace). Do not activate a paid plan until an independently verified payment/subscription receipt is recorded. No new paid vendors or gateway activation without explicit owner permission.
- Tenant/company/branch scoped PostgreSQL schema, enforced RLS, role-based authorization, audit logs, invitation and password reset. No cross-tenant data exposure; reject user-controlled orgId/role as authorization.
- Product variants/stock, boutique/tailoring/laundry/ironing workflow, customers, POS/billing/invoice, payments, collections, ledgers, staff and reporting must use durable acknowledged server writes, idempotency and atomic stock/financial state; never close forms with a false saved state.
- Establish safe export/backup/PITR policy, monitoring, error surfaces and recovery tests before customer acceptance.

## Approved stack and delivery boundaries
- Existing Next.js web in `apps/web`, Cloudflare Workers/Pages and the connected Supabase PostgreSQL/Auth; keep portable interfaces where possible.
- **No Vercel, Render or legacy Git-connected previews, builds, hosting or production services.** Existing config files may be archived in a later reviewed PR; never activate them.
- Reuse production-suitable audited OSS only where license permits (MIT/Apache-2.0/BSD/ISC etc), pin upstream reference and preserve attribution. Do not copy GPL/AGPL, enterprise, proprietary or unlicensed code.
- Do not deploy to production, change live data/schema/credentials, charge subscriptions or incur paid infrastructure without separate owner permission. GitHub branch+PR, review and CI changes remain authorized.
- Preserve the user's existing historical offline data incident evidence; do not represent new SaaS as recovery of missing records.

## Execution assignments
- **Agent A — Online SaaS Core**: Auth/tenant provisioning, RLS, products/stock/POS/finance, reliable PostgreSQL persistence.
- **Agent B — Industry Workflows**: Boutique, tailoring, laundry, ironing and configurable industry verticals in SaaS.
- **Agent C — Website + Subscription + Mobile**: Public website conversion, registration, subscription/plan state, per-tenant login link, responsive PWA/mobile.
- **QA Agent — errors only**: Independently locate/reproduce failures and document evidence and severity; no feature coding or claims of fixes.
- **Delivery Director**: Maintain assignments, existing PR completion, CI/review/UAT gates and accurate status.
All agents must follow live main, avoid overlapping PRs, focus on complete customer journeys and deliver urgent first customer acceptance without pretending zero bugs can be guaranteed.

## Verification gates
1. Registration, email verification, trial/subscription and secure tenant provisioning using test customers.
2. Logout/login, password reset, per-tenant access enforcement, RLS negative testing and invitation.
3. Boutique product + variants + stock -> sale/invoice/payment -> reload/re-login -> durable server state.
4. Laundry/ironing intake, pricing, washing/ironing/QC/delivery, charges and customer ledger; mobile screens.
5. CI typecheck, build, integration tests, independent QA report, Cloudflare deployment and real device UAT.
6. Report **source completed / CI passed / deployed / customer accepted** separately. Never advertise error-free without evidence or a 100% guarantee.

**This directive is a scope change, not permission to delete legacy customer data or deploy an unverified application.**
