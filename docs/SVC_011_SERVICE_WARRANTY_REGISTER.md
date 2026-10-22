# SVC-011 — Offline Service Warranty & Claims Register

**22 October 2026. Customer-facing, local Windows edition only.**

## Delivered scope

Orders → Service warranties and claim tracking:

- Select a **delivered**, nonarchived service order in the active branch, enter an identifiable serviced asset/reference, explicit start/end warranty dates and shop workmanship coverage notes.
- Warranty creation derives **customerId and branch scope from the existing order**, not UI-supplied identities. Asset reference is unique per order, case insensitive; duplicate registrations and invalid/backdated source-order coverage are rejected.
- Register a customer claim during the inclusive cover dates with issue description, one unresolved claim per warranty; close with a required reason as **resolved** or **rejected** and an optimistic expected-version check.
- Persist warranties, claims, revision history and active-branch linkage to optional \`serviceWarranty\` within existing Windows offline SQLite domain snapshot, export/import and backup validation. Old snapshots lacking the optional field restore an empty register. Duplicate, malformed, cross-branch or out-of-cover restored claims are rejected **before** replacing store state.
- \`orders.manage\` protects changes, \`reports.view\` protects lists. Every write produces an audit entry and schedules desktop SQLite persistence. Branch changes hide foreign records.
- The shared Orders list mounts the new panel **below** the existing table, preserving existing commercial browser smoke selectors.
- Production Web is **read-only** and domain writes fail closed without installed Windows local storage; no misleading cloud-synced claim.

## Explicit remaining requirements

**This is a shop-recorded service workmanship warranty, not a manufacturer warranty registration/entitlement, auto-approved replacement, supplier RMA, paid insurer coverage, payment authorization or refund.** Claims do not change WMS stock, invoice, customer balance or accounting. Authoritative web-cloud persistence, offline device enrollment/tenant sync, receipt-linked serial/IMEI lookup, claim repair visit schedules, parts consumption and refund workflows remain separate milestones. Host runtime and installed customer UAT are required before commercial launch.

This PR makes no production migration, installed release or paid infrastructure change and does not claim SVC-011 or the full Master Vision 100% complete.

## Test gate

- \`node --test packages/business-logic/src/__tests__/service-warranty-register.test.mjs\`
- Business-logic/UI typechecks and full regression suite
- Exact-head CI, security/dependency/licensing, Web browser workflow, Windows package/deep installed smoke, feature click, coverage
- Main post-merge CI before customer release

Source files: \`packages/business-logic/src/service-warranty-register.ts\`, \`packages/ui/src/components/orders/ServiceWarrantyPanel.tsx\`, optional snapshot state and tests.
