# Minarva Biz — QUIQQER / Open Mercato / Aimeos adoption matrix

**Checkpoint:** 2026-10-20 · Tracker: #325 · Status labels below are scoped to code, not vendor marketing. This is a prioritized implementation backlog, not a claim that all features are complete.

## Hard boundaries

- Preserve the **one product**: Next.js/TypeScript web, Electron/SQLite offline desktop, Supabase PostgreSQL online; Windows Offline + Hybrid + Online.
- Do not install QUIQQER/PHP, Laravel/Aimeos/PHP or a parallel Open Mercato database/app runtime. Avoid duplicate tenant, auth, inventory, payment and financial authorities.
- Adapt MIT code only after path/commit/license review, retaining upstream attribution and license notices. Open Mercato enterprise packages are **excluded**.
- QUIQQER Core is **GPL-3.0-or-later**: treat features as **design reference only** for the proprietary product, not source to copy, unless a separate legal approval explicitly permits the intended distribution.
- Aimeos package licensing depends on the individual repository/package (MIT vs LGPLv3). Use behavior/specification as reference first; no direct PHP/LGPL code dependency in Minarva until distribution obligations are reviewed.
- Customer-initiated catalog exports must not include purchase costs, supplier identities, internal notes, private stock counts, other-branch SKUs, outbox metadata, journal entries, or device credentials.
- No recurring paid infrastructure or AI before the 25-customer review checkpoint. No Cloudflare/Vercel/Render hosting lock-in; no hosted Supabase migration or production release without authorization.
- Financial mutations use an authoritative local transaction/reconciliation path and are blocked from unsafe cloud replay while B1 trust enrollment is incomplete (draft PR #473).

## Adoption queue (priority, not duplicate feature count)

| Priority | Source inspiration | Minarva capability | Existing evidence | Remaining acceptance gate |
|---|---|---|---|---|
| P0 | Aimeos headless / Open Mercato catalog | COM-002 shareable product catalog | `commerce-catalog.ts` existing offline CSV + HTML export; this PR adds **versioned JSON manual export** | Verified user authorization & branch scope on later publish API, no automatic live availability or pricing authority |
| P0 | Open Mercato orders/warehouse | COM-009, INV-014/017 cloud-stock authority | Existing inventory/outbox and A-SYNC-V2 staging | Atomic branch inventory revisions, dedupe, tenant-scoped E2E & packaged Windows UAT |
| P0 | Open Mercato workflows/events | PLT-008 and operational approvals | Existing order status, audit & outbox utilities | Persisted offline-approved transitions with idempotent replays and explicit roles |
| P1 | Aimeos catalog/group pricing | SAL-013/014 B2B price lists, quantity tiers | Existing retail selling price and business discount calculators | Exact-cent price-list selector scoped by branch/customer, versioned immutable price quote, authorization tests |
| P1 | Aimeos bundles/variants | INV-003, COM-003 saleable bundle kits | Existing product variant and POS cart logic | Bundle inventory atomicity, no double stock decrement, offline/online parity |
| P1 | QUIQQER memberships/plans | PLT-011 subscription entitlements | Existing license and feature gates | Signed, provider-neutral license policy; offline grace and revocation tests |
| P1 | QUIQQER templating/CMS | COM-011/012/025 website templates/pages | Existing print templates + customer site foundation | Sandboxed editor and XSS-safe publishing, tenant/domain scoping, self-host deployment |
| P1 | Open Mercato CRM custom fields | CRM-001/007 extensible customer attributes | Existing customer master & service workflows | Schema/versioning, validation, privacy and cross-tenant RLS |
| P1 | Aimeos vouchers | CRM-010/marketing promotions | Existing discount and loyalty utilities | Single redemption authority, deterministic offline conflicts, rollback & liability controls |
| P1 | Open Mercato B2B quotation workflow | SAL-002/003, PUR-002 | Existing quotations and procurement | Quote revision/approval, role evidence and purchase-order linkage |
| P2 | Aimeos checkout/shipping | COM-003/006/008 | Existing POS, invoices & delivery | Customer permission scope, reservation authority, payment gateway reconciliation and cancellation |
| P2 | QUIQQER self-service | COM-005, CRM-015 customer portal | Existing customer and service data | Authenticated least-privilege portal, scoped documents and consent-aware messaging |
| P2 | Open Mercato event subscriptions | MKT-005, operational notification workflows | Existing manual service WhatsApp and outbox | Verified opt-in and durable delivery receipt, never non-consensual bulk sending |
| P2 | Aimeos multilingual/SEO | COM-016/024 | Existing Next.js frontend | Localized routes/content + canonical metadata; accessibility and SEO tests |
| P3 | Marketplace multi-vendor, AI suggestions | optional future add-ons | Not accepted as core requirement | Separate pricing/security/hosting decision after first-customer stability |

**Delivery rule:** one independently testable production-relevant capability per small PR; exact-head typecheck/regression/Windows checks, merge, then post-merge main verification. Never equate an upstream project README's feature list with implemented Minarva functionality. Update capability registry status only with code evidence.

### Upstream sources and license review entry points

- QUIQQER Core (GPL-3.0+): https://github.com/QUIQQER/core
- Open Mercato Core (MIT; enterprise modules separate): https://github.com/open-mercato/open-mercato
- Aimeos distribution (mixed MIT/LGPLv3): https://github.com/aimeos/aimeos
- Aimeos Laravel integration (MIT): https://github.com/aimeos/aimeos-laravel
- Existing adapted MIT price validator provenance: `THIRD_PARTY_NOTICES.md`, `service-order-price-draft.ts`

**This PR's only newly implemented capability:** manual, allowlisted public catalog **JSON v1** export, reusing the existing CSV/HTML validation and branch filtering; no storefront, payments, live sync or public API deployment.
