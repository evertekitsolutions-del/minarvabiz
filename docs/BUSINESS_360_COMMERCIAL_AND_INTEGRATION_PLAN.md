# Minarva Biz — Business 360 and Commercial Plan (DRAFT)

Last reviewed: 2026-10-17. **Annual plan price points are owner-approved, GST excluded.** User/device limits, support SLAs, payment collection, licensing entitlements, launch timing and referral payout legal terms require separate approval and implementation.

## Product identity

Minarva Biz is intended to be **one connected platform to Manage, Sell and Grow a Business**, not merely POS software. The same tenant owns its product catalogue, stock, taxes, customer relationships, service jobs, staff, website, online sales and outreach. Avoid creating separately billed, unconnected apps or duplicating customer records.

| Capability | Product direction | Launch readiness to advertise |
| --- | --- | --- |
| Billing, POS, invoices, GST-aware workflows, purchases, accounts | Core operations on web/Windows | Supported workflows exist; verify edition/financial authority |
| Stock and suppliers | One authoritative product/stock history | Supported workflows exist; offline/hybrid conflict UAT remains |
| CRM and customer balances | Shared customer ID across store, POS, support and follow-ups | Existing workflows; full automatic marketing integration pending |
| Staff, attendance, rostering, engineers and service jobs | Shared workforce records and field-service lifecycle | Existing workflows; verify sync/permission paths |
| Business Website | Tenant-owned responsive site, enquiries, service requests and custom domains | **In development** — not a customer website builder now |
| E-commerce / Online Store | Public catalogue, cart/checkout, order flow and POS inventory sync | **In development** — no active hosted checkout or stock commitment |
| Marketing Tools | Consent-led campaigns, templates, enquiries, lead pipeline, review links | **Planned** — no bulk messaging or auto-send claim |
| Partner With Us | Lead attribution, commission review and payouts | **Policy draft and manual enquiry only**; no active ledger/payout |
| Online, Windows Offline, Hybrid and future mobile | Same licensed tenant data and provider-neutral interfaces | Cross-edition integration and acceptance pending |

The public website's **Solutions** page must distinguish shipped workflows from in-development features. Do not sell the planned commerce tier as complete.

## Approved annual India price ladder — EXCLUDING GST

**Owner-approved 2026-10-17:** the following are the target annual subscription price points, **excluding applicable GST**. Prices may be displayed on the public Pricing page now. **Do not open checkout, promise entitlements, accept payment for incomplete modules or modify issued licenses until further commercial and release gates pass.**

| Plan | Approved list price / business / year (ex GST) | Branch policy | Entitlements / product target |
| --- | ---: | --- | --- |
| Starter | ₹2,299 | 1 branch baseline; user/device limits TBD | Billing, inventory, purchases, accounts and reports |
| Business Pro | ₹4,499 | 1 branch baseline; user/device limits TBD | Starter + CRM, staff, attendance, services and follow-ups |
| Business Web | ₹6,699 | 1 branch baseline; user/device limits TBD | Pro + Business Website and Marketing **only after those modules are released** |
| Business 360 | ₹8,899 | 1 branch baseline; user/device limits TBD | Business Web + E-commerce / Online Store and Marketing **only after those modules are released** |
| Enterprise | Custom Quote | Contract-specific | Multi-branch, custom integrations, larger teams, migration and scoped support |

All higher tiers include all lower-tier entitlements **when those modules are actually released**. The public pricing page must visibly label the not-yet-available Business Web and Business 360 modules; the user-approved price is not a claim that those modules are shipped.

* All packages are based on 30-day supported trial eligibility; the website must not claim live online self-service trial activation.
* Do not bill for a module before launch acceptance. Until Commerce/Website/Marketing are ready, use a waitlist or individual written quote, never a claim that the Business 360 bundle is delivered.
* Exclude domain registration, third-party payment processing, SMS/WhatsApp delivery, paid email, marketplace fees and bespoke website content work unless a written package includes them.
* Desktop/offline licenses and online/hybrid capabilities need independently documented entitlements. A paying customer must know whether the fee buys updates, renewals, hosting, support and a device allowance.
* Core feature paywalls must not unexpectedly lock access to customer-owned accounting data at expiration; specify read/export and lawful access policy.
* No recurring **paid infrastructure or paid AI** for the first 25 paying customers; 25 is a review checkpoint, not an automatic spending switch. Use fair-use limits and free/self-hostable infrastructure as long as viable.

Indicative first-sale referral commissions at the approved list prices, before discounts or other exclusions: Starter ₹229.90, Business Pro ₹449.90, Business Web ₹669.90, Business 360 ₹889.90. These are **examples only**, not approved/owed payouts until a verified partner agreement and payment ledger exist. GST is excluded from the commission base.

## Referral partner policy — PROPOSED 10%, one-time

1. Partner applies, confirms identity, jurisdiction, bank/payee details, acceptance of a written agreement and anti-spam/code-of-conduct terms.
2. Lead attribution records partner ID, prospect ID, consent and timestamp before any paid conversion. Deduplicate leads and define a finite attribution window (proposal: 60 days).
3. Calculate commission on the **first eligible subscription payment** actually collected after discounts, refunds, taxes, chargebacks and gateway fees; rate **10%**. Subsequent renewals, domain fees, GST and third-party integrations are excluded by default.
4. Commission remains pending for **30 days after cleared payment** to accommodate refund/verification. Refunds/reversals adjust the ledger and prevent double payouts.
5. Prevent self-referrals, repeated leads, conflicting attributions, staff abuse, circular payments and unauthorized discounts. Human approval before any payout.
6. Payouts must be financially audited with idempotent ledger entries, TDS/GST/legal review, minimum thresholds and compliant partner invoices where required.
7. Until the ledger, fraud controls, agreements and payouts are shipped: the public Partner With Us page accepts **interest by mail only** and explicitly says the 10% rate is a proposal, not an active binding offer.

## Required integration architecture and implementation order

### A. Product/tenant foundation
- Preserve existing organization IDs, branch grants, role-bound writes, financial audit trail and zero-trust offline/online sync authority.
- Product catalogue, prices, taxes and salable stock come from a single versioned tenant source. Domain and storefront must resolve to one verified tenant; never trust a browser-supplied org ID.
- Preserve Windows Offline operations without network. Cloud synchronization cannot overwrite stock/accounting facts silently; conflicts require reviewed resolution.
- Publish a tenant-safe read model for public catalogue details; no wholesale exposure of purchase cost, staff records, service tickets or unfiltered customer PII.

### B. Business Website builder
- Business profile, business contact, about/services/products, enquiry/contact forms, approved template themes, media and custom domain ownership proof.
- Tenant-to-domain routing with verified TXT challenge/ownership; HTTPS, CSRF/rate limiting and content security. Preview before DNS activation and safe rollback.
- Public enquiries become CRM leads with consent/source attribution. Site owner can disable publication without affecting local POS.

### C. E-commerce store
- Public storefront/catalogue and categories; product visibility and variant/price rules separate from purchase-cost records.
- Cart/order draft; server-side reprice and tax validation; transactional order placement and inventory reservation with idempotency keys.
- Provider-neutral payment provider adapter; payment webhook signature verification, refund accounting, cash-on-delivery option as appropriate.
- Sync paid orders into Sales and Accounts only via authorized, audited domain transaction. Prevent duplicated invoices/sales on retries or offline replay.
- Fulfilment, cancellations, returns, shipping charges and stock release. Conflict UAT with multi-branch and offline POS concurrent sales.

### D. Marketing and CRM integration
- Consent capture, unsubscribe/suppression, source/UTM attribution, templates, segments and send limits. No unsolicited WhatsApp blasts.
- CRM lead funnel from website/store/service, manual and approved provider sending only. Future third-party provider-neutral connectors.
- Campaign attribution measurable without sharing tenant records across organizations.

### E. Partner portal (after policy approval)
- Separate secure partner identity, referral links/codes, lead dedupe, attribution snapshots, eligible subscription invoice and net fee ledger.
- Human-reviewed commissions, immutable payment/audit trail, payer/payee records, refund clawback and dispute workflow.
- No referral payouts triggered by frontend requests. Partner receives no access to merchant tenant data unless separately authorized.

## Release gates

1. Website claims/status and proposed packages reviewed by owner.
2. Main CI Green; production browser and Cloudflare Worker tests Green.
3. DNS and paid tiers unaffected by marketing merge until website deployment verified.
4. Website builder tenant isolation, payment webhook security, invoicing, offline sync and financial ledger UAT **must pass before commerce sales launch**.
5. Partner payout ledger security, privacy, anti-abuse and tax approval **must pass before real commission programme launch**.
