# SAL-015 — Tax-inclusive MRP entry (Web and Windows)

**Scope:** Add a manual per-item inclusive-MRP input to POS and Normal Billing, without modifying the existing shared sale/stock/accounting/posting transaction. This is an early country-pack cut, not a completed tax/compliance feature.

## Behavior
- User adds a product to either billing cart, clicks **MRP** (POS) or **MRP incl. tax** (Normal Billing), enters the tax-inclusive per-unit price **before existing product discount**.
- The shared pure `quoteInclusiveMrpUnitPrice` converts the entered inclusive MRP to a valid two-decimal **exclusive** `CartLine.unitPrice`, using the same tax rounding as the actual checkout.
- When exact reverse tax cannot be expressed in cents, the converter selects the **highest possible price that will not exceed** the entered inclusive per-unit MRP. Actual effective inclusive unit price and tax-exclusive price are disclosed in the UI. If a positive inclusive MRP cannot be represented as a positive exclusive price, conversion fails closed.
- Tax, discounts, quantity, stock, invoicing, payments, refunds and sync keep using existing first-party domain flows. The submitted invoice records the actual exclusive price; it does not guarantee exact equality to the originally entered inclusive MRP after multi-quantity rounding and item discounts.
- No document generator, policy, server migration or new dependency introduced. No automatic products/catalog reclassification.

## Safety and acceptance
- Typechecks, unit tests and complete CI must pass on exact PR HEAD before merge.
- `SAL-015` **remains partial** until catalog MRP/exclusive pricing mode, native invoice price basis disclosure, country legal invoice obligations, returns and multi-quantity rounding controls are implemented and tested.
- Data lives in the existing CartLine and existing sale/stock/payment/ledger source of truth. No new tables. Works in offline/online/hybrid. No provider dependency, no paid infrastructure, no cloud config changes; existing snapshots, exports and backups continue to apply. Use the existing POS adapter for future printer/scale integrations.
