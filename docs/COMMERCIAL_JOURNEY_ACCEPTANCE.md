# Commercial journey verification — 2026-10-13

## Scope and evidence boundary

This is a linked source-runtime verification batch for the existing A-FIRST-CUSTOMER outcome, based on main `75e3b14cc9623034320153f0490461cd9a761a65`. It reuses production business logic, actual monetary journals, the real domain snapshot exporter/importer and a fresh Node process. No mocked accounting, simulated success callbacks, customer records or production writes.

Run:

```sh
TZ=UTC node --test packages/business-logic/src/__tests__/commercial-purchase-sale-recovery.test.mjs
```

The test is included automatically by existing business-logic CI and coverage sweeps.

## Linked journey and independent expected balances

1. Create and approve a purchase order for 3 units at cost 50.
2. Receive 1.25 then 1.75 units; post vendor invoice 150; settle bank 50 and cash 100.
3. Cashier sells 1.25 units at 100, receiving cash 80 and card 45.
4. Manager returns 0.25 units, then exchanges another 0.5 for 0.5 units priced at 80, returning 10 extra cash.
5. Reconcile physical stock 2; inventory asset 100; COGS 50; revenue 90; profit 40; cash -55; card clearing 45; bank -50; receivable/payable zero; balanced journal/balance sheet. Negative cash/bank balances are explicit fixture funding, not fabricated opening capital.
6. Export the full domain snapshot with pending offline events. Start an independent Node process, import it and compare exact products, invoices, customers, suppliers, payments, returns, procurement, accounting and outbox records. No claim of authenticated cloud replay or native Windows disk survival.

## Reproduced gaps fixed in this batch

- A goods-receipt batch could advance an earlier PO line, stock and outbox before a later invalid/unsafe product balance threw. All projected stock balances now pass the same inventory guard before receipt numbering or mutation; repeated product lines accumulate for overflow checks.
- Refund quantities below/beyond the supported three-decimal precision could be rounded while an unnormalized selection entered refund history. Pure quoting now rejects unsupported selection precision and returns a validation error for unsafe legacy numeric values. Exchange reuses this quote and refuses before original-sale mutation.

Fault cases cover refusal with unchanged records, correction/retry without double receiving, cumulative same-product overflow, cashier denial, invalid refund/exchange and unchanged ledger/outbox.

## Tracker mapping — engineering evidence, not accepted packets

| Existing PDF packet | Evidence supplied by this batch | Still not verified here |
| --- | --- | --- |
| A-FIRST-CUSTOMER.03 | Fractional goods receipt and persisted product stock | Real opening-data import and installed UI |
| A-FIRST-CUSTOMER.04 | Cashier split sale in the linked workflow | Physical counter/UI and rapid-click UAT |
| A-FIRST-CUSTOMER.05 | Exact COGS, customer balance and balanced accounting | Real cash drawer/day-end operator UAT |
| A-FIRST-CUSTOMER.06 | PO, partial receipt, vendor invoice and payments | Authorized hosted and physical Windows UAT |
| A-FIRST-CUSTOMER.07 | Partial refund, exchange, restock and reversals | Real operator/UI across all modes |
| A-FIRST-CUSTOMER.09 | Full snapshot verification in a new process | Native Windows restore/restart and power-loss UAT |

These six mappings do not mean six accepted packets, six new features or a measured global percentage. UI printing, production tenancy/sync, updater and physical licensed Windows acceptance remain distinct. The 2026-10-12 PDF explicitly requires an audited weighted baseline before computing global completion. Neither it nor the product backlog supplies accepted weights. Full Master Vision 51% remains only the historical provisional estimate; an additional 1% is not established by this batch.

## Release boundary

Source PR, exact-head CI, postmerge CI and reviewer evidence are required. No new customer installer, physical printer result, production tenant acceptance, paid service, provider change or migration is authorized by this report. Published release remains separately verified through GitHub. Continue the first-customer acceptance/release gates without rebuilding already implemented features.
