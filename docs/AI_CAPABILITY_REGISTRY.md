# Minarva Biz — AI Capability Registry

**Status:** Living authoritative AI roadmap  
**Last updated:** 2026-10-02

## 1. AI product principle

Minarva Intelligence is not a generic chatbot. It is a shared AI layer across finance, sales, inventory, CRM, HR, commerce, marketing, manufacturing, service, support and administration.

Current market direction validates this model:

- QuickBooks now uses AI for conversational reporting, multi-step automations, file analysis, financial insights and accounting workflows.
- Zoho Books exposes AI features behind configurable provider/model preferences and uses AI for contextual actions, report insights and workflow generation.
- Odoo applies AI to business insights, document classification, transcription, website copy, email and live chat.
- Shopify Sidekick can query business data and perform store/customer/collection/marketing/shipping actions.
- Xero's JAX focuses on proactive bookkeeping and cash-flow support.
- Square Managerbot is positioned as a proactive operational agent that monitors and acts across business workflows.

Minarva should match this direction while adding local-first operation, provider neutrality and eventual self-hosted inference.

## 2. Architecture

```text
User / Automation / Module
          |
    Minarva Intelligence
          |
  -------------------------
  |          |            |
AI Gateway  Tool Policy  Knowledge/RAG
  |          |            |
Model      Permission     Tenant data
Router     + Approval     + Files
  |
-----------------------------------------
| Cloudflare AI | External AI | Own Models |
```

Required platform components:

- provider-neutral model adapter;
- model registry;
- per-organization AI preferences;
- prompt/template registry;
- structured-output validation;
- tool/action registry;
- RBAC-aware tool execution;
- human-approval engine;
- rate/usage/quota controls;
- cost tracking;
- audit log;
- model/output evaluation;
- retry/fallback rules;
- privacy/data-classification rules;
- tenant-scoped retrieval;
- document/image/voice inputs;
- optional local/on-prem model route later.

## 3. AI action classes

### A0 — Read-only
AI can inspect permitted data and answer without modifying anything.

### A1 — Draft
AI prepares content, reports or transactions. User reviews before save/send/post.

### A2 — Approval-required action
AI prepares and can execute only after explicit approval.

Examples:
- send campaign;
- post accounting correction;
- create purchase order;
- schedule staff;
- change pricing;
- submit tax data;
- refund/payment actions.

### A3 — Bounded automation
Allowed only if the business has explicitly enabled a constrained rule.

Examples:
- send payment reminder after X days;
- auto-tag OCR document;
- create low-stock notification;
- generate scheduled report.

### A4 — Never autonomous
The AI must not independently make high-impact or irreversible decisions such as:

- firing/hiring decisions;
- unrestricted bank transfers;
- tax filing without the required authorized review;
- destructive data deletion;
- unrestricted refunds;
- changing security/roles outside policy;
- silently rewriting issued accounting documents.

## 4. AI capability map

### AI-001 — Intelligent onboarding
**Mode:** A1/A2  
Ask the business a few questions and propose:

- industry pack;
- country pack;
- chart of accounts;
- taxes;
- invoice settings;
- branches/warehouses;
- opening balances;
- recommended modules;
- workflows.

### AI-002 — Migration/import mapper
**Mode:** A1

Import CSV/Excel/Tally/other-system data and:

- identify columns;
- map fields;
- normalize names;
- detect duplicates;
- flag invalid data;
- propose import corrections.

### AI-003 — Receipt and invoice OCR
**Mode:** A1

Extract:

- supplier/customer;
- invoice number/date;
- tax;
- items;
- quantities;
- prices;
- totals;
- payment terms.

### AI-004 — Document classification
**Mode:** A3 for filing; A2 for business posting

Automatically classify files into invoice, receipt, PO, contract, ID, warranty, service document, etc.

### AI-005 — Natural-language global search
**Mode:** A0

Examples:

- "Show unpaid invoices above ₹10,000."
- "Find customers who bought CCTV last year."
- "Which branch has Hikvision stock?"

### AI-006 — Natural-language command palette
**Mode:** A1/A2

Examples:

- "Create quotation for this customer."
- "Prepare a purchase order for low-stock items."
- "Draft a reminder to overdue customers."

### AI-007 — Conversational report builder
**Mode:** A0

Build filters, groupings, date ranges and charts from plain language.

### AI-008 — Report explanation
**Mode:** A0

Explain:

- profit change;
- margin decline;
- sales spikes;
- expense anomalies;
- branch differences;
- inventory changes.

Always show evidence/source records where possible.

### AI-009 — Executive daily brief
**Mode:** A0/A3

Daily summary of:

- sales;
- cash;
- receivables;
- payables;
- stock risks;
- staff exceptions;
- marketing results;
- operational alerts.

### AI-010 — Proactive business manager agent
**Mode:** A0/A1/A2

Monitor approved business metrics and surface "needs attention" items before the owner asks.

### AI-011 — Workflow/automation builder
**Mode:** A1/A2

User says:

> "When invoice is 7 days overdue, remind customer on WhatsApp and notify me."

AI converts it to a reviewable automation rule.

### AI-012 — File analysis
**Mode:** A0

Analyze uploaded contracts, spreadsheets, PDFs and reports in business context.

---

## 5. Finance and accounting AI

### AI-FIN-001 — Bank transaction categorization
Suggest category, vendor/customer and tax treatment.

### AI-FIN-002 — Bank matching/reconciliation
Suggest likely invoice/payment matches with confidence.

### AI-FIN-003 — Accounting cleanup agent
Find:

- uncategorized transactions;
- duplicates;
- missing references;
- imbalance risks;
- stale receivables/payables.

### AI-FIN-004 — Duplicate-bill detection
Detect likely duplicate supplier/customer documents.

### AI-FIN-005 — Cash-flow forecast
Forecast short-term cash and explain assumptions.

### AI-FIN-006 — Collection priority
Rank overdue collection work by amount, age and payment history; do not make credit decisions automatically.

### AI-FIN-007 — Payment reminder drafting
Generate polite reminders based on customer relationship and aging.

### AI-FIN-008 — Expense anomaly detection
Flag unusually high, duplicated or unexpected expenses.

### AI-FIN-009 — Margin anomaly detection
Detect margin erosion by product/service/order/branch.

### AI-FIN-010 — Budget vs actual insights
Explain variances and recurring overspend.

### AI-FIN-011 — Tax assistant
Explain country-pack tax treatment, missing fields and filing preparation issues.

Tax/legal outputs are assistive, not a substitute for authorized professional review.

### AI-FIN-012 — Month-end close assistant
Prepare a checklist and identify unresolved accounting items.

### AI-FIN-013 — Journal draft assistant
Draft a journal with explanation; posting requires approval.

### AI-FIN-014 — Financial scenario planning
Model "what if" changes in revenue, pricing, payroll, rent or inventory.

---

## 6. Inventory and procurement AI

### AI-INV-001 — Demand forecast
Forecast demand by SKU/category/branch/season.

### AI-INV-002 — Suggested reorder quantity
Use demand, lead time, safety stock and current inventory.

### AI-INV-003 — Stockout risk
Predict likely stockouts and expected dates.

### AI-INV-004 — Dead-stock detector
Identify slow/non-moving stock.

### AI-INV-005 — Stock ageing explanation
Explain why stock is ageing and suggest actions.

### AI-INV-006 — Cross-branch stock rebalance
Recommend transfers before new purchases.

### AI-INV-007 — Purchase planning agent
Draft purchase orders across suppliers.

### AI-INV-008 — Supplier comparison
Compare price, lead time, returns and fulfilment performance.

### AI-INV-009 — Inventory anomaly/shrinkage
Flag unusual stock adjustments/loss.

### AI-INV-010 — Price/margin assistant
Suggest price review when costs or margins move.

### AI-INV-011 — Barcode/product recognition
Use barcode/image/text to suggest product details during setup.

### AI-INV-012 — Expiry-risk assistant
Prioritize near-expiry stock and propose promotions/transfers.

---

## 7. Sales, CRM and customer AI

### AI-CRM-001 — Lead summarization
Summarize history, messages and requirements.

### AI-CRM-002 — Next-best-action suggestions
Recommend follow-up based on pipeline/context.

### AI-CRM-003 — Follow-up drafting
Generate email/WhatsApp/SMS drafts.

### AI-CRM-004 — Customer segmentation
Propose segments based on RFM, products, geography and behaviour.

### AI-CRM-005 — Churn/win-back signals
Identify customers whose buying activity has fallen.

### AI-CRM-006 — Opportunity forecast
Forecast pipeline value with transparent evidence.

### AI-CRM-007 — Quote assistant
Prepare quotation from natural-language requirements.

### AI-CRM-008 — Upsell/cross-sell suggestions
Recommend relevant products/services using transaction history.

### AI-CRM-009 — Credit-risk signals
Surface factual payment-history indicators; final credit decisions remain human/policy-based.

### AI-CRM-010 — Call transcription
Transcribe sales/service calls where lawful and consented.

### AI-CRM-011 — Call summary and task extraction
Create notes, tasks and follow-ups from calls.

### AI-CRM-012 — Customer sentiment/context
Summarize conversation tone for service prioritization; do not use it for prohibited discriminatory decisions.

---

## 8. Marketing AI

### AI-MKT-001 — Campaign generator
Generate campaign goal, segment, channel, copy and schedule.

### AI-MKT-002 — WhatsApp/SMS/email copy
Draft localized campaigns.

### AI-MKT-003 — Social content
Draft posts, calendars and variants.

### AI-MKT-004 — Product promotion suggestions
Identify stock/products that may need promotion.

### AI-MKT-005 — Campaign segmentation
Suggest audiences from business data.

### AI-MKT-006 — Subject/creative variants
Generate testable variants.

### AI-MKT-007 — Marketing performance explanation
Explain conversions, revenue and channel changes.

### AI-MKT-008 — Ad-spend optimizer
Recommend budget mix using attributable results; changes require approval.

### AI-MKT-009 — Referral/loyalty campaign ideas
Generate bounded experiments.

### AI-MKT-010 — Automated journey builder
Create reviewable lifecycle sequences.

---

## 9. Commerce, website and domain AI

### AI-COM-001 — AI website builder
Generate site structure, layout suggestions and copy from a short business brief.

### AI-COM-002 — AI store setup
Create categories, collections and navigation from product catalogue.

### AI-COM-003 — Product descriptions
Generate multilingual descriptions/specifications.

### AI-COM-004 — SEO assistant
Generate meta titles/descriptions, schema suggestions and content plans.

### AI-COM-005 — Product image assistance
Generate/edit backgrounds, banners and marketing visuals subject to model/provider policy and user approval.

### AI-COM-006 — Smart collections
Automatically propose product collections.

### AI-COM-007 — Abandoned-cart assistant
Draft recovery sequences.

### AI-COM-008 — Shipping/configuration audit
Detect incomplete or inconsistent shipping settings.

### AI-COM-009 — Storefront search assistant
Natural-language product discovery.

### AI-COM-010 — Website/live-chat agent
Business-grounded customer support/sales chat.

### AI-COM-011 — Domain-name assistant
Suggest available brand/domain candidates; purchase always requires explicit confirmation.

### AI-COM-012 — Conversion diagnostics
Explain page/cart/checkout drop-off and propose tests.

---

## 10. HR, attendance and payroll AI

### AI-HR-001 — Attendance anomaly detection
Flag unusual missing punches, repeated lateness or duplicate events for review.

### AI-HR-002 — Shift/roster assistant
Draft schedules based on availability, workload and policy.

### AI-HR-003 — Overtime forecast
Forecast overtime and staffing gaps.

### AI-HR-004 — Payroll validation
Flag unexpected deductions, salary changes or duplicate payments.

### AI-HR-005 — Employee self-service assistant
Answer policy/pay/leave questions from approved company information.

### AI-HR-006 — Timesheet summary
Summarize worklogs and missing entries.

### AI-HR-007 — Job-description drafting
Generate role descriptions.

### AI-HR-008 — Candidate document summary
Summarize resumes/applications for authorized reviewers.

AI must not autonomously make hiring, firing or promotion decisions.

### AI-HR-009 — Training/content assistant
Create onboarding/checklist/training drafts.

### AI-HR-010 — Workforce cost insights
Explain labor cost by branch/project/service.

---

## 11. Manufacturing AI

### AI-MFG-001 — Production demand plan
Recommend production quantities from demand/inventory.

### AI-MFG-002 — Raw-material purchase forecast
Forecast required material.

### AI-MFG-003 — BOM/cost anomaly
Flag unexpected material/cost variance.

### AI-MFG-004 — Wastage analysis
Explain scrap/waste patterns.

### AI-MFG-005 — Predictive maintenance
Use machine/service history to surface likely maintenance needs where adequate data exists.

### AI-MFG-006 — Quality anomaly detection
Flag unusual rejection/defect patterns.

### AI-MFG-007 — Work-centre scheduling
Draft production schedules subject to capacity.

### AI-MFG-008 — Production summary agent
Explain output, delays, consumption and profitability.

---

## 12. Service, field-service and project AI

### AI-SVC-001 — Ticket triage
Classify and route support/service requests.

### AI-SVC-002 — Screenshot/image diagnosis
Analyze screenshots/photos and suggest troubleshooting.

### AI-SVC-003 — Technician diagnostic assistant
Use service history/manuals/knowledge base.

### AI-SVC-004 — Work-order summary
Generate concise job context.

### AI-SVC-005 — Spare-part suggestion
Recommend likely required parts from known job history.

### AI-SVC-006 — Route/visit planning
Suggest efficient visit sequencing.

### AI-SVC-007 — SLA risk prediction
Surface jobs likely to miss SLA.

### AI-PROJ-001 — Project estimate assistant
Draft scope, tasks, effort and cost.

### AI-PROJ-002 — Project risk assistant
Detect overdue/dependency/cost risks.

### AI-PROJ-003 — Meeting transcription and action items
Transcribe and extract tasks where consented.

### AI-PROJ-004 — Timesheet/billing reconciliation
Identify unbilled or inconsistent time.

---

## 13. POS and restaurant AI

### AI-POS-001 — Voice product/order lookup
Natural-language item search at POS.

### AI-POS-002 — Basket recommendation
Suggest related products; cashier/user approves.

### AI-POS-003 — Queue/peak insights
Identify peak periods and staffing needs.

### AI-RES-001 — Menu performance
Explain item margin/popularity.

### AI-RES-002 — Ingredient demand
Forecast ingredient needs.

### AI-RES-003 — Kitchen delay risk
Surface KOT/orders at risk.

### AI-RES-004 — Reservation/load suggestions
Assist table allocation and staffing.

---

## 14. Industry-pack AI examples

### Boutique/tailoring
- delivery-delay prediction;
- measurement/history summary;
- material requirement suggestions;
- tailor workload balancing;
- photo/reference summarization;
- order profitability explanation.

### Laundry
- ticket SLA risk;
- supplier performance;
- load planning;
- customer notification drafting.

### Pharmacy
- expiry/stock planning;
- purchase forecasting;
- compliant document extraction.
No medical diagnosis/prescription recommendation.

### Jewellery
- metal/stone cost calculation assistance;
- margin analysis;
- repair/order status assistant;
- stock ageing.

---

## 15. Support and knowledge AI

### AI-SUP-001 — 24x7 support assistant
Grounded in current product/version docs.

### AI-SUP-002 — Screenshot analysis
Detect visible UI errors/configuration problems.

### AI-SUP-003 — Log/support-bundle analysis
Summarize likely root causes.

### AI-SUP-004 — Knowledge-base generation
Turn resolved tickets into reviewable articles.

### AI-SUP-005 — Release-aware answers
Answer according to installed version/edition.

### AI-SUP-006 — Escalation summary
Prepare concise context for human support.

### AI-SUP-007 — Feature-request clustering
Group similar requests and quantify demand.

---

## 16. Administration and platform AI

### AI-ADM-001 — Subscription/support insight
Explain churn, plan usage and renewal risk.

### AI-ADM-002 — Product usage analytics
Surface underused/high-value features.

### AI-ADM-003 — Release notes generator
Draft release notes from merged changes.

### AI-ADM-004 — Migration planner
Assist customer migration/import mapping.

### AI-ADM-005 — Integration troubleshooting
Analyze webhook/provider failures.

### AI-ADM-006 — Security anomaly summary
Summarize auth/audit anomalies for authorized admins.

### AI-ADM-007 — Data-quality agent
Find missing/inconsistent master data.

### AI-ADM-008 — Entitlement assistant
Explain plan capabilities and propose upgrade/downgrade options without silently changing subscriptions.

---

## 17. Provider-neutral AI rules

### Current phase
Prefer zero-cost/free paths and fail closed before incurring unexpected charges.

### Provider abstraction
A module calls Minarva Intelligence, never a vendor directly.

Required logical interface:

- text generation;
- structured generation;
- vision;
- speech-to-text;
- embeddings;
- reranking;
- image generation/editing where enabled;
- tool calling.

### Organization AI preferences
Future setting:

- AI enabled/disabled;
- allowed features;
- provider/model;
- cloud AI vs own/self-hosted;
- retention policy;
- user groups allowed;
- monthly usage limit.

### Future self-host path
Support an internal OpenAI-compatible or Minarva-specific gateway so models can later run through:

- vLLM;
- Ollama;
- other approved inference servers;
- Minarva-owned GPU infrastructure.

## 18. Privacy and security

- tenant isolation is mandatory;
- never train shared models on customer data by default;
- redact secrets/payment credentials;
- enforce RBAC before retrieval/tool execution;
- separate AI conversation memory by organization/user;
- audit model, prompt/version, tool calls and final action;
- configurable retention;
- allow organization-level AI disable;
- prefer data minimization;
- support country/data-residency controls later.

## 19. Evaluation and reliability

Before enabling an AI capability in production, define:

- allowed inputs;
- expected structured output;
- test dataset;
- accuracy/quality threshold;
- refusal/fallback path;
- tool permission;
- approval policy;
- latency target;
- cost/quota target;
- privacy classification;
- monitoring.

Financial/accounting automation must prioritize deterministic validation over LLM confidence.

## 20. Delivery order

### AI Foundation — P0
- provider-neutral gateway;
- tenant/RBAC context;
- prompt registry;
- tool/action registry;
- structured output;
- audit;
- usage/quota;
- evaluation harness.

### First customer-value AI — P1
- OCR;
- business Q&A;
- report explanation;
- support screenshot/log analysis;
- low-stock/reorder suggestions;
- reminder/campaign drafting;
- import mapper.

### Operational agents — P2
- finance cleanup;
- cash-flow;
- purchase planning;
- CRM next-best-action;
- website/store generator;
- attendance/payroll validation;
- manufacturing/service/project agents.

### Advanced agentic platform — P3
- proactive manager agent;
- natural-language workflow builder;
- bounded autonomous operations;
- multi-agent orchestration where justified;
- optional self-hosted enterprise AI.

## 21. Definition of success

AI is successful when it reduces repetitive work, surfaces important exceptions and helps users take correct actions without hiding uncertainty or removing human control over consequential business decisions.
