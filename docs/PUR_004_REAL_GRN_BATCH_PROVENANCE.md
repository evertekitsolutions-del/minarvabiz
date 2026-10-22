# PUR-004 / INV-005 — Supplier batch provenance on actual Goods Receipts

**Date:** 2026-10-22 · Feature-first implementation cut.

## Delivered

Unlike isolated INV-005 SQLite pilot modules, this change touches the **actual purchase-order → posted goods-receipt** workflow of Minarva Biz.

- Shared Web/Windows `ProcurementPanel`: installed **Windows desktop** receives optional supplier **Batch/Lot Code** and **Expiry Date** inputs per physical PO line during Receive Goods.
- `procurementStore.receivePurchaseOrder` validates each submitted pair BEFORE product/WMS stock mutation. A complete pair requires a linked product, a printable 1–64-character batch code, actual calendar dates and expiry **not earlier than** GRN receipt date. Blank pairs preserve untracked legacy GRNs; incomplete, expired or malformed pairs reject the entire GRN batch before any stock mutation.
- Each posted `GoodsReceiptLine` carries optional `batchCode` and `expiresOn`. Real `procurementStore` list/export/hydrate and existing SQLite `DomainSnapshot` copy the new optional fields without changing snapshot schema version. The Goods Receipts history shows captured lot and expiry per line.
- One lot per PO line per GRN. To receive two distinct batches against one PO line, use **two partial GRNs**. This is supplier provenance rather than an authoritative lot stock quantity ledger.
- Uses the existing supplier/PO/GRN inventory workflow, NOT new GPL/LGPL source, paid dependencies or production Supabase schema migrations.

## Boundaries — critical

The production Supabase `goods_receipt_lines` schema and remote mapping have **not** been extended. Windows desktop permits batch editing; hosted Web does not display batch inputs because cloud storage would not durably retain them. Metadata remains present in local domain snapshot and optional outbound payloads but **cloud sync does not guarantee retention**. Do not claim Web/Hybrid parity or customer-ready remote lot tracking until columns/mappers/RLS and sync tests are implemented, reviewed, and production migration authorized.

This is **not** FIFO/FEFO checkout, batch reservation, expiry-safe POS, warehouse-specific quantity posting, recall, or full lot lifecycle. Posted stock quantity still uses existing product/WMS store. An expired lot is refused for normal available GRN stock instead of falsely marking it saleable. For rejected/expired goods, use a separately authorized quarantine workflow (currently isolated SQLite pilot, not live GRN).

## Verification

- `node --test packages/business-logic/src/__tests__/goods-receipt-batch-metadata.test.mjs`
- `node --test packages/business-logic/src/__tests__/procurement-goods-receipts.test.mjs`
- Exact-head business logic suite, TypeScript Web/Desktop, Windows package and installed smoke, browser regression, security, coverage, CI and post-merge checks.

No production migrations, deploy, new installer release, paid service or unsupported Full Master Vision % claim.
