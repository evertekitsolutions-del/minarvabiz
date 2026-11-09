# Minarva Biz — Coding agent instructions

> **CURRENT OWNER BINDING OVERRIDE — 2026-11-09:** The **entire project** is now **ONLINE SaaS + Mobile ONLY**. Read [docs/OWNER_DIRECTIVE_2026-11-09_SAAS_ONLY.md](docs/OWNER_DIRECTIVE_2026-11-09_SAAS_ONLY.md) first. Any older instruction requiring Windows Offline, Electron, SQLite local-first or Hybrid is superseded. Preserve historical customer data and backups without modification.

## Mission and source of truth
- Build a complete secure multi-tenant Minarva Biz SaaS for browser/mobile. Keep one configurable multi-industry ERP: boutique, tailoring, laundry, ironing first, all other approved industries retained.
- Begin each run by reading LIVE main SHA, existing PRs, issues #325 and #735, mandatory CI and actual web/RLS state; do not duplicate PRs or assume older task progress.
- Use `apps/web` Next.js, Supabase PostgreSQL/Auth/RLS, Cloudflare Workers/Pages (and portable domain interfaces). Never use Vercel or Render for Minarva Biz.
- No new offline/desktop/hybrid implementation, installer releases or testing. Historical source and Windows customer backups are preservation/recovery evidence, not active deliverables.
- Prior product completion percentages were provisional. Only independently tested, customer-accepted SaaS journeys count.

## Priority and assignments
1. Public customer website **Register -> Plan/Subscribe -> Email verification -> Tenant provisioning -> Tenant login URL -> authenticated ERP**, secure on smartphone/PWA.
2. Durable server-acknowledged stock/product/Sales/POS/payments and full boutique/tailoring/laundry/ironing journeys. Do not report "saved" before committed; no duplicate financial effect or stock count.
3. Agent A: online SaaS core, RLS and finance; Agent B: industry modules; Agent C: public website, signup, subscription and mobile; QA agent: **find/reproduce/report errors only**; Director: independent coordination, priority and acceptance.
4. Finish relevant existing web/Supabase PRs before new foundations. Prefer audited permissive OSS with pinned donor and attribution; never copy GPL/AGPL/proprietary code.

## Engineering safety
- Enforce verified tenant/company/branch identity, RBAC and RLS in **server/database**, not only web UI. A per-customer URL is not authentication.
- Persist all business writes in Supabase only after verified membership/permissions and transaction/idempotency checks. Test restart/re-login, disconnected requests, retries, multi-user races and cross-tenant denial.
- **No production database migration, data mutation, paid integrations, live deploy, subscription charge, release or secrets rotation without explicit owner authorization.** Do not use customer data as a fixture or touch pre-existing Windows archives.
- Onboarding and plans must show accurate availability; charging disabled until authorized and verified. No promises of zero errors before real acceptance.
- Open branch/PR with full user journey, tests, exact-head CI, independent review, rollback and deployment/UAT blockers. Do not merge incomplete drafts or mark source code as deployed.

## QA and communication
- QA agent independently logs reproducible issues (steps, expected/actual, severity, source location, CI evidence) and does NOT write features or deploy.
- Run web typecheck/build and focused integration/security tests. Validate Cloudflare deployment and mobile UAT before claiming commercial readiness.
- Brief evidence-based Malayalam updates with real PR/test links and separate implementation/CI/deployment/UAT statuses.
