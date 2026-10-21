# PUR-002 — Request for Quotation (RFQ) Draft Preview

Date: 2026-10-21. Source inspiration: ERPNext buying/RFQ and Odoo Purchase vendor enquiry workflows. Original Minarva TypeScript; no upstream GPL/LGPL code, assets, or dependencies were copied.

## Customer-facing slice

Open **Procurement → Request supplier quotations (RFQ)** in Web or Windows. Enter an RFQ reference, required delivery date and notes. Select up to 25 registered suppliers and up to 50 stock/catalog products, each with a positive quantity precise to 0.001 unit. Click **Preview RFQ** to validate the current authorized branch scope and preview one requested item row per supplier/product pairing. Click **Export RFQ CSV** to download a vendor-by-item enquiry sheet with supplier contacts, product IDs, names/SKUs, units, quantities and notes.

RFQ preview is **not a recorded transaction or a quote request dispatched to the vendor**. No supplier communication, message, approval, stock movement, payment, journal, outbox, tenant DB write or dependency was introduced. CSV cells are RFC4180 escaped and formula injection is neutralized. Validation fails on deleted/inactive/foreign-branch products, duplicate IDs, invalid dates, imprecise or excessive quantities, invalid supplier IDs or draft limits.

## Remaining full PUR-002 acceptance

Durable tenant/branch-scoped RFQ records and statuses, supplier email/WhatsApp opt-in send adapters, vendor quote response capture, bid evaluation and negotiation, authenticated approval, PO conversion, immutable audit trail, offline/online/hybrid sync conflict/replay handling, and customer UAT remain future milestones. Do not mark the full capability complete for this source slice.

## Verification

- `node --test packages/business-logic/src/__tests__/rfq-draft-preview.test.mjs`
- `pnpm --filter @minarvabiz/business-logic typecheck`
- `pnpm --filter @minarvabiz/ui typecheck`
- Exact-head GitHub PR build, Windows installed tests, security, coverage, post-merge main checks before claiming source acceptance.

Rollback: revert PUR-002 source PR. No schema changes, paid infrastructure, production release or deployment. No whole-product completion percentage increase claimed.
