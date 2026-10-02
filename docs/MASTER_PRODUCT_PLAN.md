# Minarva Biz — Global AI-First Business Operating Platform Master Plan

**Status:** Authoritative product direction  
**Last updated:** 2026-10-02  
**Scope:** One shared commercial platform for Online, Offline Windows and Hybrid deployments, serving multiple countries and industries.

## 1. Product mission

Minarva Biz will evolve from billing/ERP software into a **global local-first business operating platform for small and medium businesses**.

The product target is broader than Vyapar parity. Minarva Biz should combine the most useful capabilities found across modern SMB platforms such as Vyapar, QuickBooks, Zoho, Odoo, Shopify, Square and Xero, while preserving three differentiators:

1. true local-first operation with cloud synchronization;
2. modular country/industry packs over one shared core;
3. a provider-neutral AI and infrastructure architecture that can later move to Minarva-owned servers.

## 2. Permanent product rules

These rules are non-negotiable unless explicitly revised in this document.

### One core, many packs
Do not fork separate products for boutique, retail, restaurant, pharmacy, manufacturing or other industries. Use:

- **Minarva Biz Core**
- **Country Packs**
- **Industry Packs**
- **Add-ons**
- **Feature entitlements**

### Local-first hybrid architecture
Core billing and operational workflows must remain usable when the internet is unavailable wherever technically reasonable.

- Windows/desktop primary local store: SQLite.
- Shared cloud/global truth: PostgreSQL-compatible central store.
- Hybrid synchronization: outbox/event ledger + idempotency + conflict handling.
- Cloud services must enhance the product, not become the only way a store can bill customers.

### Global core, not India-hardcoded
Country-specific compliance belongs in Country Packs.

The core must not assume:

- INR only;
- GST only;
- India-only financial year;
- India-only addresses/phone formats;
- UPI-only payments;
- IST-only dates;
- one invoice-number format;
- one language.

### Branch-aware data model
Global stock is a derived total, never the only source of truth.

Required dimensions include:

- organization;
- company/business;
- branch/location;
- warehouse/godown;
- device/counter;
- user/staff;
- transaction/event identity.

### AI everywhere, but safely
AI is a platform capability, not a chatbot add-on.

Every major module should be reviewed for:

- AI assistance;
- AI search/reporting;
- AI prediction;
- AI automation;
- AI agent actions.

Consequential AI actions require policy checks, approval where appropriate and complete audit history.

### Self-host portability
Any mandatory managed dependency must have a migration path.

Core standards:

- PostgreSQL-compatible database;
- SQLite local database;
- S3-compatible object storage;
- standard HTTPS/JSON APIs;
- replaceable payment/messaging/domain/AI providers;
- container-friendly services;
- portable backups/exports.

### Zero-cost commercial constraint
Until at least 25 paying customers, avoid mandatory recurring paid infrastructure wherever practical.

The 25-customer mark is a review point, not automatic approval to add paid dependencies.

## 3. Product topology

```text
                         MINARVA BIZ
                              |
        ------------------------------------------------
        |                   |                          |
   Client Apps         Business Platform          Control Plane
        |                   |                          |
 Web / Windows /       Finance / Sales /          Subscription
 Mobile / POS          Inventory / CRM            Entitlements
        |              HR / Commerce              Licensing
        |              Manufacturing              Updates
        |              Services / Projects        Support
        |                   |                          |
        ---------------- Shared API ------------------
                              |
                 Local-first Sync + Event Layer
                              |
                   PostgreSQL / Object Storage
                              |
          ------------------------------------------
          |                                        |
     Country Packs                           Industry Packs
```

## 4. Core platform capabilities

### Identity, tenancy and administration
- organizations, companies, branches and warehouses;
- users, teams, devices and counters;
- RBAC and custom roles;
- approval policies;
- audit log;
- feature flags;
- subscription entitlements;
- device and session management;
- multi-company switching;
- data residency metadata;
- localization/time-zone/currency preferences.

### Sales, billing and POS
- GST/non-GST and country-specific invoices;
- quotations/estimates;
- sales orders;
- delivery notes/challans;
- credit/debit notes;
- recurring invoices;
- POS;
- hold/resume carts;
- split/partial payments;
- refunds/exchanges;
- discount/price approval;
- cash drawer/shift reconciliation;
- barcode/QR;
- weighing-scale integrations;
- thermal/A4 printing;
- custom invoice templates;
- digital receipts;
- customer display/kiosk mode.

### Accounting and finance
- double-entry accounting;
- chart of accounts;
- journals;
- customer/vendor ledgers;
- receivables/payables;
- cash and bank accounts;
- bank import/feed adapters;
- reconciliation;
- expenses;
- budgets;
- cash-flow statements;
- P&L;
- balance sheet;
- trial balance;
- fixed assets/depreciation;
- loans/advances;
- multi-currency;
- cost centres;
- branch/company consolidation;
- tax reports;
- accountant access;
- close/lock periods.

### Inventory and warehouse
- products/services;
- categories/brands;
- variants;
- units/conversions;
- serial/lot/batch;
- expiry;
- barcode generation/scanning;
- price lists;
- party-specific rates;
- multiple MRP/sale prices;
- landed cost;
- stock ledger;
- stock adjustment;
- cycle count/physical count;
- low-stock/reorder levels;
- godowns/warehouses;
- branch transfers;
- in-transit stock;
- reservations;
- damaged/returned stock;
- stock ageing;
- dead stock;
- costing methods;
- stock valuation.

### Purchases and procurement
- RFQ;
- purchase order;
- goods receipt;
- supplier invoices;
- purchase returns;
- vendor advances;
- payment-out;
- supplier rate contracts;
- supplier performance;
- reorder workflows;
- approval limits.

### CRM and customer success
- customer 360;
- leads;
- pipeline;
- follow-ups;
- tasks/reminders;
- notes/call history;
- segmentation;
- loyalty;
- coupons;
- referrals;
- customer credit limits;
- service reminders;
- payment reminders;
- customer portal;
- consent/communication history;
- telecalling workflows.

### HR, Attendance Grid and Payroll
- employee master;
- attendance grid;
- clock-in/out;
- shifts/rosters;
- holidays;
- leave;
- overtime;
- late/early rules;
- breaks;
- biometric adapters;
- optional geofence/mobile attendance;
- attendance corrections/approvals;
- payroll;
- salary structures;
- commissions/incentives;
- advances/loans;
- deductions;
- payslips;
- statutory country payroll packs;
- employee self-service;
- timesheets;
- workforce cost reports.

### Online store, website and domains
Create **Minarva Commerce** as one integrated layer:

- instant online store from inventory;
- product catalogue;
- cart/checkout;
- coupons;
- customer accounts;
- online payments;
- click-and-collect;
- delivery/shipping;
- order-to-invoice conversion;
- stock sync;
- abandoned-cart workflows;
- business website builder;
- pages, blog, gallery, services and forms;
- booking/appointment widgets;
- SEO controls;
- analytics;
- custom domain mapping;
- domain search/purchase/renewal adapters;
- DNS automation;
- SSL automation;
- website/store templates;
- multilingual storefronts.

Domain providers must be behind an adapter so registrar migration does not require product-core changes.

### Marketing and growth
- WhatsApp campaigns;
- SMS;
- email campaigns;
- templates;
- scheduled campaigns;
- customer segments;
- greetings/offers;
- loyalty campaigns;
- referral campaigns;
- payment/service reminders;
- social publishing;
- Meta/Google ad integration;
- campaign attribution;
- landing pages;
- lead forms;
- marketing automation journeys;
- consent/unsubscribe controls;
- campaign analytics.

### Manufacturing
- BOM/recipes;
- raw materials;
- production orders;
- consumption;
- finished goods;
- WIP;
- scrap/wastage;
- production cost;
- routing/work centres;
- machine/assets;
- maintenance;
- quality checks;
- production planning;
- batch traceability;
- manufacturing/consumption reports.

### Services, field service and AMC
- service catalogue;
- work orders;
- technicians;
- scheduling;
- onsite jobs;
- checklists;
- spare parts;
- photos/documents;
- customer signatures;
- AMC/contracts;
- warranties;
- service reminders;
- SLA tracking;
- route/visit planning;
- profitability per job.

### Projects and professional services
- projects;
- tasks;
- milestones;
- timesheets;
- project costs;
- estimates;
- resource allocation;
- project billing;
- retainers;
- recurring services;
- profitability;
- client portal.

### Restaurant/hospitality pack
- table management;
- KOT/KDS;
- modifiers;
- waiter orders;
- reservations;
- recipes;
- ingredient consumption;
- wastage;
- split bills;
- delivery/takeaway;
- kitchen performance.

### Retail pack
- fast POS;
- scanner/weighing scale;
- promotions;
- loyalty;
- returns/exchanges;
- shelf labels;
- multiple price tiers;
- store/warehouse stock.

### Boutique/tailoring pack
- measurements/history;
- design/photo references;
- job cards;
- tailor assignment;
- cutting/stitching/alteration/QC;
- delivery dates;
- material issue/return;
- custom wedding orders;
- profitability.

### Laundry pack
- ticket/bag tracking;
- garment/item status;
- barcode/tag;
- ironing;
- outsourced processing;
- rate cards;
- SLA;
- pickup/delivery;
- customer notifications.

### Pharmacy pack
- batch/expiry;
- substitutions;
- supplier lots;
- purchase/sales compliance;
- prescription attachment where legally appropriate;
- controlled country-specific functionality behind compliance packs.

### Jewellery pack
- purity/weight;
- making charges;
- stone/component costing;
- barcode/tag;
- repair/order jobs;
- metal rate tables;
- inventory traceability.

### Documents, workflow and support
- documents/file repository;
- forms;
- e-signature adapters;
- approval workflows;
- helpdesk/tickets;
- knowledge base;
- AI support centre;
- screenshot diagnostics;
- support bundles;
- SLA/escalation;
- audit history.

### Analytics and BI
- customizable dashboards;
- branch/company consolidation;
- scheduled reports;
- drill-down;
- cohort/customer analytics;
- product/category profitability;
- inventory analytics;
- workforce analytics;
- marketing analytics;
- manufacturing analytics;
- anomaly dashboard;
- executive daily brief.

### Integrations and marketplace
- public REST API;
- webhooks;
- OAuth/app permissions;
- payment gateway adapters;
- messaging adapters;
- domain registrar adapters;
- shipping/logistics adapters;
- accounting import/export;
- Tally migration;
- e-commerce marketplace adapters;
- hardware adapters;
- developer marketplace;
- integration health/status.

## 5. Country Packs

Country packs must contain only country-specific concerns:

- tax engine rules;
- invoice/legal fields;
- e-invoicing integrations;
- statutory reports;
- payroll/statutory rules;
- supported payment adapters;
- local address/identity fields;
- fiscal calendar defaults;
- compliant numbering/document rules.

Initial target packs:

1. India;
2. UAE;
3. Oman;
4. Saudi Arabia;
5. UK;
6. EU/VAT baseline;
7. USA sales-tax framework;
8. Australia;
9. Canada.

Do not claim compliance until each pack has its own verified legal/accounting acceptance criteria.

## 6. Subscription and entitlement model

Normal customers should not manage license keys.

Target customer flow:

```text
Sign up
 -> choose country + industry
 -> choose plan/add-ons
 -> pay/start trial
 -> subscription webhook
 -> organization provisioned
 -> entitlements activated
 -> web/desktop/mobile unlock automatically
```

Entitlements should express:

- country pack;
- industry packs;
- modules;
- seats/users;
- branches;
- devices;
- storage;
- offline capability;
- sync capability;
- API access;
- AI allowance/credits;
- support tier;
- expiry/grace state.

Offline-only activation remains a fallback.

## 7. Local-first multi-branch synchronization model

### Operational authority
Local branch database is the immediate operational authority while offline.

### Global reconciliation authority
Central PostgreSQL is the shared reconciliation authority for:

- consolidated reporting;
- cross-branch transfer;
- subscription/entitlements;
- users/permissions;
- device management;
- global customer/catalog state.

### Required sync guarantees
- UUID/event identity;
- idempotency;
- append-only accounting/stock events;
- optimistic versions for editable masters;
- branch/warehouse ownership;
- retry-safe outbox;
- inbound change feed;
- conflict queue;
- last-sync visibility;
- offline-state visibility;
- data repair/replay tools.

Issued financial transactions should be corrected by reversal/credit-note/revision flows, not silent overwrite.

## 8. AI platform rule

See `docs/AI_CAPABILITY_REGISTRY.md`.

Minarva Intelligence must use a provider-neutral gateway and a tool/action policy layer. AI providers/models are replaceable configuration, not hard-coded product dependencies.

Every AI output/action must be classified as:

- **informational** — read-only;
- **draft** — prepares content/transaction for human review;
- **approval-required** — proposed action requires confirmation;
- **policy-automated** — pre-approved bounded automation;
- **prohibited-autonomous** — never execute automatically.

## 9. Self-host migration target

Today, managed services may include Cloudflare, Supabase and GitHub. The product core must remain movable.

Future Minarva-owned deployment target:

```text
CDN / Reverse Proxy / Load Balancer
             |
        API Containers
             |
  ---------------------------
  |            |            |
PostgreSQL   S3-compatible  Queue/Jobs
  |          Object Store      |
Replicas       Backups       Workers
             |
        AI Gateway
             |
     Own/External Models
```

Likely self-hostable building blocks can include:

- PostgreSQL;
- MinIO or another S3-compatible store;
- Valkey/Redis where cache is justified;
- NATS/RabbitMQ/compatible durable queue where required;
- containerized APIs/workers;
- Prometheus/Grafana/Loki-compatible observability;
- self-hosted identity option;
- vLLM/Ollama-compatible internal AI gateway later.

Provider-specific services may be used as acceleration layers, but must not become the only representation of critical business data.

## 10. Delivery phases

### Phase A — Commercial foundation / first 25 paying customers
Priority is stability and revenue without recurring infrastructure pressure.

1. complete Render removal from License Admin;
2. self-service subscription/entitlement foundation;
3. global-core audit for India hard-coding;
4. local-first Sync v2 and branch/warehouse correctness;
5. Vyapar-parity gap audit;
6. AI provider/gateway foundation;
7. customer onboarding, support and updater hardening;
8. first commercial customer UAT.

### Phase B — Core parity + growth suite
1. accounting/finance depth;
2. inventory/procurement depth;
3. CRM/loyalty;
4. HR Attendance Grid + payroll;
5. Minarva Commerce store/website/domain;
6. marketing automation;
7. AI embedded into each delivered module.

### Phase C — Industry operating system
1. manufacturing;
2. service/field service;
3. restaurant;
4. retail;
5. boutique/tailoring;
6. laundry;
7. pharmacy;
8. jewellery;
9. projects/professional services.

### Phase D — Globalization
1. country-pack framework;
2. India pack extraction from core;
3. GCC packs;
4. UK/EU/US/AU/CA packs;
5. multi-currency and global payment localization;
6. data residency options.

### Phase E — Ecosystem and platform
1. marketplace;
2. partner/reseller portal;
3. developer APIs;
4. white-label options where commercially appropriate;
5. advanced automation;
6. cross-product AI agents.

### Phase F — Owned infrastructure
Move incrementally, not as a rewrite.

1. Minarva-controlled domains/front door;
2. containerized API services;
3. owned PostgreSQL;
4. S3-compatible object storage;
5. queues/background workers;
6. observability;
7. off-site DR;
8. optional self-hosted AI inference;
9. multi-region as customer scale requires.

## 11. Engineering process

Every feature must pass these questions before implementation:

1. Which shared-core domain owns it?
2. Is it Core, Country Pack, Industry Pack or Add-on?
3. Does it work Online, Offline or Hybrid?
4. What happens when the internet fails?
5. What is its multi-branch behavior?
6. What is its AI opportunity?
7. What AI actions require approval?
8. Can its provider be replaced?
9. Can data be exported/migrated?
10. Can it move to Minarva-owned infrastructure?
11. Does it introduce recurring cost before 25 customers?
12. What automated tests and UAT prove it?

Development continues in small verified milestones:

**live state -> branch -> implement -> tests -> PR -> all gates green -> merge -> continuation update**.

## 12. Competitive review cadence

The Capability Registry is a living document.

At least quarterly, re-check:

- Vyapar;
- QuickBooks;
- Zoho;
- Odoo;
- Shopify;
- Square;
- Xero;
- relevant regional/local competitors.

New competitor capabilities should be classified as:

- already covered;
- useful gap;
- industry-specific;
- country-specific;
- not aligned;
- AI opportunity.

Do not copy proprietary UI, branding or code. Benchmark capabilities and design Minarva-native workflows.

## 13. Definition of the long-term product

**Minarva Biz = Billing + Accounting + Inventory + POS + Procurement + CRM + HR/Attendance/Payroll + E-commerce + Website/Domain + Marketing + Manufacturing + Service/Projects + Industry Packs + Country Packs + AI Agents + Integrations — local-first, cloud-synced, globally sellable and self-hostable.**
