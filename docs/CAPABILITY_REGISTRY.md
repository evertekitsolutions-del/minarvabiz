# Minarva Biz — Capability Registry

**Purpose:** Prevent feature loss across chats/phases and provide one checklist for competitor parity + Minarva differentiation.  
**Last updated:** 2026-10-02

Implementation status must be verified against live code before marking a capability complete. This registry defines **required product scope**, not completion claims.

Legend:

- **Core** — shared platform capability;
- **Country** — Country Pack;
- **Industry** — Industry Pack;
- **Add-on** — optional commercial module;
- **AI** — Minarva Intelligence capability;
- **Control** — Minarva SaaS/control-plane capability.

## Platform / tenancy

| ID | Capability | Class |
|---|---|---|
| PLT-001 | Organizations / tenants | Core |
| PLT-002 | Multiple companies/businesses | Core |
| PLT-003 | Multiple branches/locations | Core |
| PLT-004 | Warehouses/godowns | Core |
| PLT-005 | Device/counter registry | Core |
| PLT-006 | Users/teams | Core |
| PLT-007 | RBAC / custom roles | Core |
| PLT-008 | Approval policies | Core |
| PLT-009 | Audit log | Core |
| PLT-010 | Feature flags | Core |
| PLT-011 | Subscription entitlements | Control |
| PLT-012 | Localization / language | Core |
| PLT-013 | Time zone | Core |
| PLT-014 | Multi-currency | Core |
| PLT-015 | Company/branch consolidated view | Core |
| PLT-016 | Global search / command palette | Core |
| PLT-017 | Notifications centre | Core |
| PLT-018 | Import/export/migration framework | Core |
| PLT-019 | Backup/restore | Core |
| PLT-020 | Recycle bin / restore deleted records | Core |

## Billing / sales / POS

| ID | Capability | Class |
|---|---|---|
| SAL-001 | Invoice / bill | Core |
| SAL-002 | Quotation / estimate | Core |
| SAL-003 | Sales order | Core |
| SAL-004 | Delivery note / challan | Core |
| SAL-005 | Credit note | Core |
| SAL-006 | Debit note | Core |
| SAL-007 | Recurring invoice | Core |
| SAL-008 | POS | Core |
| SAL-009 | Hold/resume/suspended carts | Core |
| SAL-010 | Split/partial payments | Core |
| SAL-011 | Refund/exchange | Core |
| SAL-012 | Discount approval | Core |
| SAL-013 | Party-specific price | Core |
| SAL-014 | Multiple item prices / price lists | Core |
| SAL-015 | MRP-inclusive billing | Country/Core |
| SAL-016 | Barcode/QR scan | Core |
| SAL-017 | Barcode generation | Core |
| SAL-018 | Thermal/A4 printing | Core |
| SAL-019 | Custom invoice templates | Core |
| SAL-020 | UPI/dynamic payment QR adapters | Country/Add-on |
| SAL-021 | Cash drawer / cashier shift | Core |
| SAL-022 | Weighing-scale integration | Add-on |
| SAL-023 | Customer display/kiosk | Add-on |
| SAL-024 | E-receipt/share PDF | Core |
| SAL-025 | Group multiple orders into invoice | Core |
| SAL-026 | Invoice profit visibility with permission | Core |

## Accounting / finance

| ID | Capability | Class |
|---|---|---|
| FIN-001 | Double-entry ledger | Core |
| FIN-002 | Chart of accounts | Core |
| FIN-003 | Journal entries | Core |
| FIN-004 | Customer/vendor ledgers | Core |
| FIN-005 | Receivables/payables | Core |
| FIN-006 | Cash accounts | Core |
| FIN-007 | Bank accounts | Core |
| FIN-008 | Bank import/feed adapters | Add-on |
| FIN-009 | Reconciliation | Core |
| FIN-010 | Expense tracking | Core |
| FIN-011 | Payment-in/payment-out | Core |
| FIN-012 | Bill-wise settlement | Core |
| FIN-013 | Cash-flow statement | Core |
| FIN-014 | Profit & loss | Core |
| FIN-015 | Balance sheet | Core |
| FIN-016 | Trial balance | Core |
| FIN-017 | Day book | Core |
| FIN-018 | Fixed assets/depreciation | Core |
| FIN-019 | Loans/advances | Core |
| FIN-020 | Budgets | Core |
| FIN-021 | Cost centres | Core |
| FIN-022 | Branch/company consolidation | Core |
| FIN-023 | Period close/lock | Core |
| FIN-024 | Accountant access | Core |
| FIN-025 | Party-wise profit/loss | Core |
| FIN-026 | Bill-wise profit/loss | Core |
| FIN-027 | Product/service profitability | Core |
| FIN-028 | Multi-currency revaluation | Core |

## Tax / compliance

| ID | Capability | Class |
|---|---|---|
| TAX-001 | Pluggable tax engine | Core |
| TAX-002 | India GST | Country |
| TAX-003 | HSN/SAC | Country |
| TAX-004 | CGST/SGST/IGST | Country |
| TAX-005 | TDS/TCS | Country |
| TAX-006 | GSTR reports | Country |
| TAX-007 | India e-Invoice | Country |
| TAX-008 | India e-Way Bill | Country |
| TAX-009 | UAE VAT | Country |
| TAX-010 | Oman VAT | Country |
| TAX-011 | Saudi VAT/ZATCA pack | Country |
| TAX-012 | UK VAT | Country |
| TAX-013 | EU VAT baseline | Country |
| TAX-014 | USA sales-tax framework | Country |
| TAX-015 | Australia GST | Country |
| TAX-016 | Canada GST/HST/PST | Country |
| TAX-017 | Fiscal calendar / numbering rules | Country |
| TAX-018 | Country-specific invoice legal fields | Country |

## Inventory / warehouse

| ID | Capability | Class |
|---|---|---|
| INV-001 | Products/services | Core |
| INV-002 | Categories/brands | Core |
| INV-003 | Variants | Core |
| INV-004 | Units/conversions | Core |
| INV-005 | Batch/lot | Core |
| INV-006 | Expiry | Core |
| INV-007 | Serial number | Core |
| INV-008 | Stock ledger | Core |
| INV-009 | Stock adjustment | Core |
| INV-010 | Opening stock | Core |
| INV-011 | Reorder level | Core |
| INV-012 | Low-stock alerts | Core |
| INV-013 | Warehouses/godowns | Core |
| INV-014 | Branch stock | Core |
| INV-015 | Stock transfer | Core |
| INV-016 | In-transit stock | Core |
| INV-017 | Stock reservation | Core |
| INV-018 | Physical/cycle count | Core |
| INV-019 | Damaged/returned stock | Core |
| INV-020 | Stock ageing | Core |
| INV-021 | Dead stock | Core |
| INV-022 | Stock valuation | Core |
| INV-023 | Landed cost | Core |
| INV-024 | Custom item fields | Core |
| INV-025 | Bulk item update/import | Core |
| INV-026 | Label printing | Core |

## Procurement / vendors

| ID | Capability | Class |
|---|---|---|
| PUR-001 | Suppliers/vendors | Core |
| PUR-002 | RFQ | Core |
| PUR-003 | Purchase order | Core |
| PUR-004 | Goods receipt | Core |
| PUR-005 | Supplier invoice | Core |
| PUR-006 | Purchase return | Core |
| PUR-007 | Vendor advance | Core |
| PUR-008 | Supplier payment | Core |
| PUR-009 | Supplier rate contracts | Core |
| PUR-010 | Procurement approval | Core |
| PUR-011 | Supplier performance | Core |

## CRM / customer growth

| ID | Capability | Class |
|---|---|---|
| CRM-001 | Customer 360 | Core |
| CRM-002 | Leads | Add-on/Core |
| CRM-003 | Sales pipeline | Add-on/Core |
| CRM-004 | Follow-ups/tasks | Core |
| CRM-005 | Notes/call history | Core |
| CRM-006 | Customer credit limit | Core |
| CRM-007 | Segmentation | Core |
| CRM-008 | Loyalty points | Core |
| CRM-009 | Loyalty tiers/rewards | Add-on |
| CRM-010 | Coupons | Core |
| CRM-011 | Referral program | Add-on |
| CRM-012 | Birthday/anniversary automation | Add-on |
| CRM-013 | Service reminders | Core |
| CRM-014 | Payment reminders | Core |
| CRM-015 | Customer portal | Add-on |
| CRM-016 | Telecalling workflow | Add-on |
| CRM-017 | Communication consent/history | Core |
| CRM-018 | Win-back/inactive-customer workflow | Add-on |

## HR / Attendance Grid / payroll

| ID | Capability | Class |
|---|---|---|
| HR-001 | Employee master | Core |
| HR-002 | Attendance Grid | Add-on/Core |
| HR-003 | Clock-in/out | Add-on |
| HR-004 | Shift/roster | Add-on |
| HR-005 | Holidays | Add-on |
| HR-006 | Leave | Add-on |
| HR-007 | Overtime | Add-on |
| HR-008 | Late/early rules | Add-on |
| HR-009 | Break rules | Add-on |
| HR-010 | Attendance corrections/approval | Add-on |
| HR-011 | Biometric integration | Add-on |
| HR-012 | Mobile/geofence attendance | Add-on |
| HR-013 | Payroll | Add-on |
| HR-014 | Salary structures | Add-on |
| HR-015 | Commission/incentives | Add-on |
| HR-016 | Employee advances/loans | Add-on |
| HR-017 | Deductions | Add-on |
| HR-018 | Payslips | Add-on |
| HR-019 | Employee self-service | Add-on |
| HR-020 | Timesheets | Add-on |
| HR-021 | Country payroll/statutory packs | Country |

## Commerce / website / domain

| ID | Capability | Class |
|---|---|---|
| COM-001 | One-click online store | Add-on |
| COM-002 | Product catalogue sync | Add-on |
| COM-003 | Cart/checkout | Add-on |
| COM-004 | Online payments | Add-on |
| COM-005 | Customer accounts | Add-on |
| COM-006 | Shipping/delivery adapters | Add-on |
| COM-007 | Click-and-collect | Add-on |
| COM-008 | Order-to-invoice automation | Add-on |
| COM-009 | Inventory sync | Add-on |
| COM-010 | Abandoned cart | Add-on |
| COM-011 | Business website builder | Add-on |
| COM-012 | Pages/about/services/gallery | Add-on |
| COM-013 | Blog | Add-on |
| COM-014 | Forms/leads | Add-on |
| COM-015 | Booking/appointment widgets | Add-on |
| COM-016 | SEO controls | Add-on |
| COM-017 | Web analytics | Add-on |
| COM-018 | Custom domain mapping | Add-on |
| COM-019 | Domain search | Add-on |
| COM-020 | Domain purchase | Add-on |
| COM-021 | Domain renewal | Add-on |
| COM-022 | DNS automation | Add-on |
| COM-023 | SSL automation | Add-on |
| COM-024 | Multilingual storefront/site | Add-on |
| COM-025 | Theme/template system | Add-on |

## Marketing

| ID | Capability | Class |
|---|---|---|
| MKT-001 | WhatsApp templates | Add-on |
| MKT-002 | Bulk WhatsApp | Add-on |
| MKT-003 | SMS | Add-on |
| MKT-004 | Email campaigns | Add-on |
| MKT-005 | Transactional notifications | Core/Add-on |
| MKT-006 | Greetings/offers | Add-on |
| MKT-007 | Scheduled campaigns | Add-on |
| MKT-008 | Marketing segments | Add-on |
| MKT-009 | Journey automation | Add-on |
| MKT-010 | Landing pages | Add-on |
| MKT-011 | Social publishing | Add-on |
| MKT-012 | Meta ads integration | Add-on |
| MKT-013 | Google ads integration | Add-on |
| MKT-014 | Attribution | Add-on |
| MKT-015 | Campaign analytics | Add-on |
| MKT-016 | Consent/unsubscribe controls | Core |

## Manufacturing

| ID | Capability | Class |
|---|---|---|
| MFG-001 | BOM/recipe | Industry |
| MFG-002 | Raw materials | Industry |
| MFG-003 | Production order | Industry |
| MFG-004 | Material consumption | Industry |
| MFG-005 | Finished goods | Industry |
| MFG-006 | WIP | Industry |
| MFG-007 | Scrap/waste | Industry |
| MFG-008 | Production cost | Industry |
| MFG-009 | Routing/work centres | Industry |
| MFG-010 | Machine/assets | Industry |
| MFG-011 | Maintenance | Industry |
| MFG-012 | Quality | Industry |
| MFG-013 | Production planning | Industry |
| MFG-014 | Manufacturing report | Industry |
| MFG-015 | Consumption report | Industry |

## Service / field service / AMC

| ID | Capability | Class |
|---|---|---|
| SVC-001 | Service catalogue | Industry/Core |
| SVC-002 | Work orders | Industry |
| SVC-003 | Technician assignment | Industry |
| SVC-004 | Scheduling | Industry |
| SVC-005 | Site visit | Industry |
| SVC-006 | Checklists | Industry |
| SVC-007 | Spare parts | Industry |
| SVC-008 | Photo/document evidence | Industry |
| SVC-009 | Customer signature | Industry |
| SVC-010 | AMC/contracts | Industry |
| SVC-011 | Warranty tracking | Industry |
| SVC-012 | SLA | Industry |
| SVC-013 | Route planning | Industry |
| SVC-014 | Job profitability | Industry |

## Projects / professional services

| ID | Capability | Class |
|---|---|---|
| PRJ-001 | Projects | Add-on |
| PRJ-002 | Tasks | Add-on |
| PRJ-003 | Milestones | Add-on |
| PRJ-004 | Timesheets | Add-on |
| PRJ-005 | Resource allocation | Add-on |
| PRJ-006 | Project estimates | Add-on |
| PRJ-007 | Project billing | Add-on |
| PRJ-008 | Retainers/recurring service | Add-on |
| PRJ-009 | Project profitability | Add-on |
| PRJ-010 | Client portal | Add-on |

## Industry packs

| ID | Capability | Class |
|---|---|---|
| IND-RET | Retail | Industry |
| IND-BOUT | Boutique/tailoring | Industry |
| IND-LAUN | Laundry/ironing | Industry |
| IND-REST | Restaurant/KOT/KDS | Industry |
| IND-PHAR | Pharmacy | Industry |
| IND-JEWL | Jewellery | Industry |
| IND-GROC | Grocery/supermarket | Industry |
| IND-MFG | Manufacturing | Industry |
| IND-SVC | Service/field service | Industry |
| IND-PROJ | Professional services/projects | Industry |
| IND-WHOL | Wholesale/distribution | Industry |
| IND-SALON | Salon/appointments | Industry |
| IND-AUTO | Auto/service workshop | Industry |

## Documents / support / workflow

| ID | Capability | Class |
|---|---|---|
| DOC-001 | File/document repository | Core |
| DOC-002 | Forms | Core/Add-on |
| DOC-003 | E-signature adapter | Add-on |
| DOC-004 | Approval workflows | Core |
| SUP-001 | Helpdesk/tickets | Core/Add-on |
| SUP-002 | Knowledge base | Core |
| SUP-003 | AI Support Center | AI |
| SUP-004 | Screenshot diagnostics | AI |
| SUP-005 | Support bundle/log export | Core |
| SUP-006 | SLA/escalation | Add-on |
| SUP-007 | Feature-request management | Core |

## Analytics / reports

| ID | Capability | Class |
|---|---|---|
| BI-001 | Custom dashboards | Core |
| BI-002 | Custom reports | Core |
| BI-003 | Scheduled reports | Core |
| BI-004 | Drill-down | Core |
| BI-005 | Branch/company consolidation | Core |
| BI-006 | Sales analytics | Core |
| BI-007 | Inventory analytics | Core |
| BI-008 | Finance analytics | Core |
| BI-009 | Customer/cohort analytics | Add-on |
| BI-010 | Workforce analytics | Add-on |
| BI-011 | Marketing analytics | Add-on |
| BI-012 | Manufacturing analytics | Industry |
| BI-013 | Executive daily brief | AI |

## Local-first sync

| ID | Capability | Class |
|---|---|---|
| SYN-001 | SQLite local primary store | Core |
| SYN-002 | Outbox queue | Core |
| SYN-003 | Inbound change feed | Core |
| SYN-004 | UUID/event identity | Core |
| SYN-005 | Idempotency | Core |
| SYN-006 | Versioning | Core |
| SYN-007 | Conflict queue | Core |
| SYN-008 | Branch-aware reconciliation | Core |
| SYN-009 | Append-only financial events | Core |
| SYN-010 | Append-only stock movements | Core |
| SYN-011 | Retry/replay | Core |
| SYN-012 | Sync diagnostics | Core |
| SYN-013 | Last-sync visibility | Core |
| SYN-014 | Offline branch status | Core |
| SYN-015 | Data repair tools | Core |

## Control plane / SaaS business model

| ID | Capability | Class |
|---|---|---|
| CTL-001 | Self-service signup | Control |
| CTL-002 | Free trial | Control |
| CTL-003 | Subscription plans | Control |
| CTL-004 | Add-ons | Control |
| CTL-005 | Entitlements | Control |
| CTL-006 | Monthly/yearly billing | Control |
| CTL-007 | Upgrade/downgrade | Control |
| CTL-008 | Proration | Control |
| CTL-009 | Coupons/discounts | Control |
| CTL-010 | Payment-provider abstraction | Control |
| CTL-011 | Billing webhooks | Control |
| CTL-012 | Grace period | Control |
| CTL-013 | Read-only/suspended mode | Control |
| CTL-014 | Revenue recovery | Control |
| CTL-015 | Customer portal | Control |
| CTL-016 | Device management | Control |
| CTL-017 | License issuance | Control |
| CTL-018 | Offline activation fallback | Control |
| CTL-019 | Usage/AI credits | Control |
| CTL-020 | Partner/reseller portal | Control |
| CTL-021 | Support tiers | Control |
| CTL-022 | Feature flags/experiments | Control |
| CTL-023 | Control-plane administrator identity & RBAC | Control |
| CTL-024 | Administrator MFA / AAL2 enforcement | Control |
| CTL-025 | First-administrator bootstrap & recovery | Control |
| CTL-026 | Emergency break-glass administration | Control |

## Integrations / hardware / developer ecosystem

| ID | Capability | Class |
|---|---|---|
| INT-001 | REST API | Add-on/Core |
| INT-002 | Webhooks | Add-on/Core |
| INT-003 | OAuth/app permissions | Add-on |
| INT-004 | Integration marketplace | Add-on |
| INT-005 | Payment gateways | Add-on |
| INT-006 | Messaging providers | Add-on |
| INT-007 | Domain registrars | Add-on |
| INT-008 | Shipping/logistics | Add-on |
| INT-009 | Tally import/export | Core/Add-on |
| INT-010 | E-commerce marketplaces | Add-on |
| INT-011 | Barcode scanners | Core |
| INT-012 | Thermal/A4 printers | Core |
| INT-013 | Weighing scales | Add-on |
| INT-014 | Biometric devices | Add-on |
| INT-015 | Cash drawers | Add-on |
| INT-016 | Payment terminals | Add-on |

## AI

The full AI list is authoritative in `docs/AI_CAPABILITY_REGISTRY.md`.

Required AI families:

| ID | Capability family |
|---|---|
| AI-GEN | Business Q&A / global command agent |
| AI-OCR | OCR/document extraction |
| AI-FIN | Accounting/reconciliation/cash-flow |
| AI-INV | Demand/reorder/inventory optimization |
| AI-CRM | CRM/follow-up/customer insights |
| AI-MKT | Marketing/content/automation |
| AI-COM | Website/store/domain/SEO |
| AI-HR | Attendance/payroll/workforce |
| AI-MFG | Manufacturing/planning/maintenance |
| AI-SVC | Service/support/project agents |
| AI-BI | Conversational reports/explanations |
| AI-AUTO | Natural-language workflow builder |
| AI-MGR | Proactive manager agent |
| AI-PLAT | Provider-neutral routing/evaluation/audit |

## Self-host portability checklist

Every new capability must declare:

- where its authoritative data lives;
- whether offline mode is supported;
- external provider dependency;
- export format;
- replacement adapter;
- self-host option/path;
- backup/restore plan;
- tenant/data-residency concerns;
- recurring cost;
- AI/privacy classification where applicable.

## Registry maintenance rule

No major feature should be implemented without an ID in this registry or a documented reason to add a new ID.

Quarterly competitor research may add capabilities, but should not silently remove previously committed scope.

## Full-scope / reuse rule

- Difficulty, time, dependency friction or provider limitations are not reasons to silently remove or downgrade a capability already accepted into this registry.
- Small milestones may deliver the capability incrementally, but the registry item is not complete until the agreed full behavior is implemented and verified.
- Before writing major functionality from scratch, inspect existing Minarva code, official SDKs/reference implementations and mature open-source options.
- Third-party code reuse must pass license, security, maintenance, portability and self-hostability review. Public GitHub visibility alone is not permission to copy code.
- When a reused component is adopted, record upstream source/version/license and the Minarva replacement/migration path.
- See `docs/ENGINEERING_REUSE_POLICY.md` for the authoritative engineering policy.
