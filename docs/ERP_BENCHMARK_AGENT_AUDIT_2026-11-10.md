# Initial multi-agent ERP audit & benchmark — 2026-11-10

**Owner directive:** Agents 1–5 resumed; all five hourly automations enabled. This is an evidence-backed initial report, not a full browser UAT or a statement of full Master Vision completeness.

## Verified baseline
- GitHub `main`: `63356934cd41df33bc37886923a023ea7d16ce2e`; PR #798 merged.
- Cloudflare Worker `minarvabiz-customer-web-preview`: build `a801dbef-7b1d-4556-8899-8976830c1410` SUCCESS; deployment `f8cfa03e-59f1-4ff3-bf8c-0cc7cdee9fc3` allocated 100%.
- Official 25/25 milestones accepted; not 440 Master Vision feature completeness or independent live-UAT certification.
- Live PostgreSQL has **100/100 public tables with RLS enabled**. Anonymous/default-access warnings are not proof of exploit.

## Agent 5 — actual audit findings (read-only; 2026-11-10 approx 06:00–06:08 UTC)
### P0 AUTH-REDIRECT-001 — confirmed production email redirect to localhost
- New signup at 06:00:49 UTC produced an Auth user and tenant, HQ branch, admin membership. `confirmation_sent_at` populated; email confirmed by 06:01:34 UTC. No first tenant trial existed when inspected.
- Supabase edge log `POST /auth/v1/signup` passed `redirect_to=https://minarvabiz.com/register/complete` with HTTP 200, while the subsequent `GET /auth/v1/verify` contained `redirect_to=http://localhost:3000` and returned HTTP 303. A previous password-recovery verification request at 05:21 UTC likewise had localhost as redirect.
- `auth_logs` showed `mail.send` with Supabase default sender and a successful implicit verification login. Delivery to this one mailbox is observed, not guaranteed for all external customers.
- **Inference, not fully verified root cause:** hosted GoTrue Site URL and/or email template/redirect allowlist remains configured for localhost or rejects production redirect. The connected Supabase tool does not expose Auth URL config read/write. Owner must inspect Dashboard → Authentication → URL Configuration and Email Templates, set Site URL `https://minarvabiz.com`, allow `https://minarvabiz.com/**` and `https://www.minarvabiz.com/**`, remove localhost, ensure confirmation/recovery templates respect `redirect_to`. Production SMTP sender should be configured for external customers.
- Severity P0: signup email callback goes to localhost despite correct frontend request; trial activation requires `/register/complete` and was not persisted. Reproduce: fresh browser signup, receive and open verification email, observe redirect URL, then check `saas_tenant_subscriptions` by authenticated tenant. Do NOT call trial RPC using service role to counterfeit success.

### P1 AUTH-ONBOARD-002 — created tenant without trial
- The recorded new email-confirmed Auth user has organization/HQ/admin membership but zero matching `saas_tenant_subscriptions` row at audit. Likely downstream effect of missed `/register/complete`, not separately proven. Compare callback redirect and browser logs; repeat after fixing hosted Auth configuration.

### P1 SEC-DEF-003 — database advisor warnings require contract review
- Supabase Security Advisor: 17 anon-executable SECURITY DEFINER routines; 55 authenticated-executable SECURITY DEFINER routines; leaked-password protection warning; 13 RLS-enabled tables without policies (some private/system, must triage by schema).
- Some exposed RPCs are intentionally edge-secret protected and required by licensing; **do not bulk-revoke**. Perform function-by-function threat model, effective role/tenant scoping, rate limits, signature and boundary tests. Reference https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable .
- Positive security facts: 100/100 public base tables RLS enabled, and a read-only `SET LOCAL ROLE authenticated` test using a fabricated outsider JWT subject returned zero accessible live tenant, membership, HQ and profile records. **Not** proof of independent two-tenant signed JWT HTTP isolation.
- Performance Advisor: 88 missing FK covering indexes, 111 candidate unused indexes, one multiple-permissive-policies warning; prioritize hotspot profiling and explain plans rather than blindly adding/removing indexes.

### QA evidence gaps
- No independently captured browser DevTools console/HAR, no physical printer test, and no authenticated two-tenant cross-company HTTP negative tests. Supabase logs query did not surface matching PostgREST/Edge 500 errors during sampled period, but this is not a complete HTTP/Cloudflare runtime audit.
- POS invoice save and stock mutation idempotency paths need real authorized test-tenant transaction replay and reconciliation after onboarding is repaired; no owner/customer data mutations were performed in this audit.

## Benchmarks — capabilities to prototype
| Priority | Feature | Leading ERP reference | Existing foundation / assessed gap | Prototype & persistence contract |
|---|---|---|---|---|
| 1 | Automated reorder suggestions | ERPNext auto Material Request per warehouse/reorder levels | `reorder-csv.ts`, `saas_purchase_orders`, warehouse/branch stock exist; automated supplier proposal not shown in cloud schema | Pure deterministic velocity+lead-time draft calculator (this PR); subsequent gated unique `(org,branch,product,planning_day)` suggestion table with auditable approval, no direct posting |
| 2 | Recurring invoices | ERPNext Subscription Plan recurring Sales Invoices | `SAL-007` registered; SaaS *own* tenant-billing subscription exists but **not equivalent** to customer recurring invoices | Tenant-scoped recurring contract/schedule, prepaid/postpaid, timezone-aware invoice generation, period-key uniqueness and credit-safe retries |
| 3 | Multi-currency & FX rates | Odoo currency-rate service, exchange-difference journals | `PLT-014`, `FIN-028` registered; no public FX-rate ledger table found | ISO 4217+minor units, append-only rate snapshots with provider/UTC timestamp, double-entry realized FX journals and fallback for stale rates; provider adapters fail closed |
| 4 | Dynamic warehouse bin location | SAP Business One segment bins, receipts/issue allocations | `warehouse_locations`, `warehouse_stock.location_id` exist; aisle/rack/shelf constraints and movement audits not evidenced | Additive hierarchical bin/location tree, reserved/on-hand invariants, branch/warehouse ACL, stock movements with idempotent transfer receipts |
| 5 | Customer loyalty tiers | ERPNext multi-tier Loyalty Program and point ledger | Coupons, campaigns and leads already exist; no distinct loyalty point/tier ledger found | Immutable points earn/redeem/reverse entries, Silver/Gold/VIP rule version, refund reversal; opt-in SMS/WhatsApp event outbox only, never automatic paid sends |

**Official references:**
- Odoo 19 multi-currency and automatic FX: https://www.odoo.com/documentation/19.0/applications/finance/accounting/get_started/multi_currency.html
- ERPNext automated replenishment: https://docs.frappe.io/erpnext/auto-creation-of-material-request
- ERPNext recurring subscriptions: https://docs.frappe.io/erpnext/subscription
- ERPNext loyalty: https://docs.frappe.io/erpnext/loyalty-program
- SAP Business One warehouse bin locations: https://help.sap.com/docs/SAP_BUSINESS_ONE/68a2e87fb29941b5bf959a184d9c6727/5bafa1ff5526433abee833ab5f7b4e36.html

Upstream code is **reference behavior only** for ERPNext (GPL), Odoo (LGPL) and SAP (proprietary). Adopt license-compatible MIT Open Mercato pure TS selectively with attribution; do not copy vendor source.

## Immediate execution queue
1. **Agent 4 + Agent 5, P0** — repair/verify hosted Supabase Site URL, redirect allowlist, email templates and SMTP, then test a fresh full verification and trial activation from browser with owner's real mailbox; no unverified green.
2. **Agent 5, P1** — reproduce POS/inventory transactions with authorized signed tenant/staff JWTs in isolated QA tenant, true HTTP negative RLS, double-submit and fail/retry; prepare exact severity list and repro traces.
3. **Agent 2, P2** — review the pure reorder prototype in `packages/business-logic/src/replenishment-suggestion.ts`, add supplier contract/policy and approved-order deduping in separate feature-gated PR; do not migrate prod without consent.
4. **Agent 2, P2** — prototype recurring invoice event/period engine and currency-rate snapshot with safe integer/currency arithmetic.
5. **Agent 3, P2/P3** — inspect existing location hierarchy before bin transfer additions; implement loyalty-ledger pure rules and opt-in event-outbox prototype.
6. **Agent 1** — allocate unique capability ID, avoid overlapping PR ownership, insist on license proof, atomic tenant/branch RLS, exact-head CI and negative tests. **Agent 4** verifies preview, rollback plan and explicit deployment approval before production Cloudflare rollout.

## Scope and release guardrails
This PR is a **zero-side-effect reorder prototype**, not a live feature. It has no production schema/migration, no cron, no customer SMS, no automatic PO, no deployment. The function only returns a draft recommendation with deterministic per-tenant/day dedupe key. Inventory and purchase writes must occur later through a properly authorized Supabase RPC with single-transaction stock/accounting persistence and idempotent unique constraints, after product-owner acceptance.
