# OWNER MASTER DIRECTIVE — 2026-11-09: 30-day execution / 25 verified milestones

**Binding effective immediately. Supersedes every older progress percentage, older A/B/C roles, desktop delivery, and backlog priority where inconsistent.** Repo: `evertekitsolutions-del/minarvabiz`. Target: **2026-12-09**; 30 days is a target, not a guaranteed quality exemption.

## Absolute product and license boundaries

Build **ONLINE-ONLY**, multi-tenant ERP (Vyapar-grade), tenant ecommerce/store builder, digital marketing, boutique/laundry/ironing/tailoring/field-service, mobile-first installable PWA on **Cloudflare Workers/Pages + Supabase Auth/Postgres/RLS**. RETIRE new Windows/Electron/offline/SQLite/hybrid sync code and tests; preserve historical customer SQLite backup data read-only without edits/deletion.

**MIT code only, pinned upstream SHA and per-file LICENSE review:**
- Core/commerce: `open-mercato/open-mercato@69f0884009598b0ac034fee67f5dd34962434fa7`.
- Garment/laundry: `agrayush13/laundry-lo-src@fd48e8ba2dd29b07f3487013f43fdf92f9e67920`.
- Dry-cleaning/POS interface flow: `TiredofSleep/Custom-POS@11d627fc85ca47d25ac5f387965585f889a99faf` — no browser-only storage as authoritative write.
- Log copied source file paths, license headers/attribution, dependencies, donor tests and local integration tests. Never copy AGPL/GPL/LGPL/commercial/unknown-license code (including Bigcapital, Odoo, ERPNext, Aimeos, Open Mercato enterprise). Do not greenfield-rewrite existing ERP standard modules.

**Operational safety:** Every mutation must be tenant/company/branch/RBAC/RLS scoped, server-authoritative, PostgreSQL committed/readback confirmed; error before fake Saved toast; retries idempotent, stock/ledger atomic. No production database migrations, customer writes, live deployment, payments, paid infra, secrets rotation without **separate explicit owner authorization**. Isolated test orgs only for destructive/negative QA.

## Scoring contract: no milestone until four Gates

- **Gate A:** Milestone-scoped PR merged to `main`.
- **Gate B:** On exact merged `main` commit SHA, typecheck + build + lint + automated tests all green (skipped or pending do not prove pass).
- **Gate C:** Cloudflare deployment reachable and Supabase PostgreSQL persist/readback confirmed across hard refresh, logout/re-login, separate browser sessions.
- **Gate D:** Independent Agent 5 authenticated/negative tenant RLS, failure/retry, silent data-loss and financial/stock tests complete; zero open P0/P1 on milestone; signed QA evidence.
- Each all-four-Gates milestone = **4%**; otherwise **0%**, never fractional. Initial verified score **0/25 = 0%** due missing live Gate C and Gate D proof. Existing merged code is not a production-verified milestone.

## 25-milestone roadmap and ownership

| Week | ID | Milestone | Owner | Gate A | Gate B | Gate C | Gate D | Score | Known blocker |
|---|---|---|---|---|---|---|---|---|---|
| 1 | M1 | Atomic product/category/variant/stock writes | Agent 2 | Not verified | Unverified | Unverified | Unverified | **0%** | #762 draft; #761 P0 open |
| 1 | M2 | SaaS registration -> verified email -> provision -> tenant login | Agent 4 | Merged #759 | Unverified | Unverified | Unverified | **0%** | #759 merged; Cloudflare/Auth + QA missing |
| 1 | M3 | Cross-tenant RLS isolation negative tests | Agent 5 | Not verified | Unverified | Unverified | Unverified | **0%** | Live two-tenant auth/REST negative proof absent |
| 1 | M4 | Tenant export + isolated backup/restore drill | Agent 4 | Not verified | Unverified | Unverified | Unverified | **0%** | Durable export/restore UAT missing |
| 1 | M5 | Cloudflare production routing and auth callbacks | Agent 4 | Not verified | Unverified | Unverified | Unverified | **0%** | Production routing/health tests missing |
| 2 | M6 | Brand/Fabric/Color/Size variant matrix and stock reconcile | Agent 2 | Not verified | Unverified | Unverified | Unverified | **0%** | Pinned Open Mercato donor integration & QA pending |
| 2 | M7 | Inventory, transfers, adjustments and import/export | Agent 2 | Not verified | Unverified | Unverified | Unverified | **0%** | Atomic cloud stock audit pending |
| 2 | M8 | Supplier purchases, PO, GRN, returns and payables | Agent 2 | Not verified | Unverified | Unverified | Unverified | **0%** | Cloud financial ledger proof absent |
| 2 | M9 | Tax-inclusive Price POS, barcode scanning, split tender, returns | Agent 2 | Not verified | Unverified | Unverified | Unverified | **0%** | GST-inclusive Price and online POS UAT pending |
| 2 | M10 | Idempotent atomic checkout, stock and ledgers | Agent 2 | Not verified | Unverified | Unverified | Unverified | **0%** | Concurrent retries/transaction tests pending |
| 2 | M11 | Thermal print, 38x25mm 2-up barcode/QR with PDF fallback | Agent 2 | Not verified | Unverified | Unverified | Unverified | **0%** | Multi-row physical or simulated calibration QA pending |
| 2 | M12 | Cash/bank, ledgers, aging, P&L/BS and GST/VAT | Agent 2 | Not verified | Unverified | Unverified | Unverified | **0%** | Accounting reconciliation evidence absent |
| 3 | M13 | Laundry garment rate cards and TAT | Agent 3 | Not verified | Unverified | Unverified | Unverified | **0%** | MIT laundry donor integration pending |
| 3 | M14 | Laundry/tailoring intake -> processing -> QC -> delivery | Agent 3 | Not verified | Unverified | Unverified | Unverified | **0%** | Delivered ironing defect, durable tracking QA pending |
| 3 | M15 | Unified boutique/laundry/tailoring ledger | Agent 3 | Not verified | Unverified | Unverified | Unverified | **0%** | Cross-workflow financial reconciliation pending |
| 3 | M16 | Tenant storefront/website builder | Agent 3 | Not verified | Unverified | Unverified | Unverified | **0%** | Live scoped tenant catalog/store integration pending |
| 3 | M17 | Cart/checkout/COD/shipping -> ERP order/stock | Agent 3 | Not verified | Unverified | Unverified | Unverified | **0%** | Idempotent store order sync pending |
| 3 | M18 | SEO, promos, CRM leads and campaigns | Agent 3 | Not verified | Unverified | Unverified | Unverified | **0%** | Marketing SaaS flows pending |
| 3 | M19 | Field service/AMC online parity | Agent 3 | Partial #608–#611 | Unverified | Unverified | Unverified | **0%** | #608–#611 merged historically; cloud parity QA absent |
| 4 | M20 | Public SaaS site, 30d trial, 10% partner and annual pricing | Agent 4 | Not verified | Unverified | Unverified | Unverified | **0%** | Full plan/referral activation QA pending |
| 4 | M21 | Trial/Pending/Active/Grace/Expired entitlements | Agent 4 | Not verified | Unverified | Unverified | Unverified | **0%** | Server entitlement enforcement proof absent |
| 4 | M22 | Verified gateway webhook + Owner approval | Agent 4 | Not verified | Unverified | Unverified | Unverified | **0%** | No verified paid activation integration |
| 4 | M23 | Android/iOS PWA, touch flows, camera scan, no offline inventory | Agent 4 | Partial #759 | Unverified | Unverified | Unverified | **0%** | #759 PWA shell merged; full mobile QA incomplete |
| 4 | M24 | Independent auth/RLS/API/performance/security audit | Agent 5 | Not verified | Unverified | Unverified | Unverified | **0%** | Pen/test + P0/P1 remediation pending |
| 4 | M25 | Full live production UAT and handover | Agent 5 | Not verified | Unverified | Unverified | Unverified | **0%** | All prior gates/customer acceptance pending |

## Agent boundaries, daily and 48h queue

**Agent 1 — Director:** Master gatekeeper; maintain Issues [#325](https://github.com/evertekitsolutions-del/minarvabiz/issues/325) and [#735](https://github.com/evertekitsolutions-del/minarvabiz/issues/735), reconcile evidence per milestone, assign tasks to 2/3/4. Refuse offline code, unlicensed copied code or unsanctioned deployment. Never mark milestones complete without Agent 5 sign-off.

**Agent 2 — Online Core/Vyapar:** M1, M6–M12. First complete [#762](https://github.com/evertekitsolutions-del/minarvabiz/pull/762), compare overlapping [#763](https://github.com/evertekitsolutions-del/minarvabiz/pull/763), close [P0 #761](https://github.com/evertekitsolutions-del/minarvabiz/issues/761) **only after QA**. Cloud ACK on Products/Category/Variant/Stock/Sale/Payment; variant matrix; inventory/WMS, purchases/GRN, cash/ledger/tax. Retail forms, receipts, labels use GST-inclusive **Price**, remove Special Price. POS retry-safe, zero cutter drift; compact 38×25 mm 2-up barcode + QR labels with PDF fallback.

**Agent 3 — Verticals/Store/Marketing:** M13–M19. Pinned laundry/garment and POS UI MIT reuse, intake/QR, wash/stitch/iron/QC/delivery, vendor/outsource, combined ledgers, tenant store/checkout/shipping/COD prepayment, lead marketing and durable Supabase parity for PR #608–#611.

**Agent 4 — Onboarding/Cloud/PWA:** M2/M4/M5/M20–M23. Verify [#759](https://github.com/evertekitsolutions-del/minarvabiz/pull/759) register -> email confirmation -> `private.bootstrap_new_user()` -> tenant login -> dashboard, Cloudflare Auth callback allowlist, isolated backup drill, yearly INR ₹2,299/4,499/6,699/8,899, 30-day trial, 10% referral, entitlements and signed payment webhooks requiring owner approval, installable mobile UI with no offline inventory cache.

**Agent 5 — Independent QA/watchdog:** Own M3/M24/M25 and mandatory Gate D on M1–M25. **No feature coding, no PR merges, no deployment, no production/customer data mutations.** Start #762/#761: negative failure (timeout/403/500/zero-row/update forgery), physical committed Supabase readback, logout/reload, Tenant A -> B forbidden REST/URL/payload writes, idempotent POS double-click/concurrency/partial payment tests. For every reproduced bug file GitHub Issue with `file:line`, steps, P0/P1/P2, expected/actual and evidence. Block associated milestone and sign off only on zero P0/P1.

## Immediate 48-hour acceptance

- #762/#763 conflict resolved by evidence, exact-head checks and QA safety tests; do not falsely claim M1 while category, variant, stock or payment saves are still blocked.
- #759 Cloudflare / Supabase authenticated onboarding UAT in an isolated permitted environment; provision/RLS/redirect negative cases.
- Initial cross-tenant security matrix, backup inventory and Cloudflare deployment route inventory documented without destructive actions.
- Agent 3 tenant laundry/store donor and adapter map with MIT attribution and test selection; choose existing relevant PR, not a duplicate feature PR.
- Director publishes complete scorecard each run; gate proof: PR merge commit SHA, CI URLs, deployed domain/ref, test-org persistence, independent QA issue/signoff.
