# Fractional checkout and inventory balances

Source milestone based on main `8b2c0893597fe000daa4832b302ee92de2b30dd1` (PR #376).

## Reproduced customer blocker

A fabric product with 0.3 units cannot be sold as two lines of 0.1 and 0.2: both cart and final live-stock guards summed binary floats to 0.30000000000000004. A separate 0.1 sale left 0.19999999999999998, preventing the remaining 0.2 sale. WMS already uses three decimal places, so its balance diverged from the product balance.

## Shared fix

Reuse the existing `toQuantityMilli` and quantity scale from `@minarvabiz/utils` for stock movement and cart demand arithmetic. Preserve reservation, transit and branch preflight. Reject unsupported sale precision and unsafe quantities before any mutation. Preflight resulting live balances even when negative stock is explicitly allowed, so corrupted data cannot throw after warehouse consumption.

No dependencies, schema changes, production records, paid services or release changes. Existing Web and Windows consumers use the same business logic. No bulk historical migration is performed. Balance comparisons and subsequent movements use the existing three-decimal WMS/billing scale; genuinely higher-precision legacy balances round to that scale (at most 0.0005 units).

## Evidence and remaining acceptance

Behavioral regression tests reproduce the rejected fractional split, residual balance and unsupported precision before the fix. They assert exact product/WMS zero, cash and COGS reconciliation, and unchanged sale/ledger/outbox on oversale or invalid live stock. Existing three-decimal inventory property tests cover movement conservation.

Exact-head CI, postmerge checks and physical licensed Windows/Online/Offline/Hybrid customer UAT remain separate gates. Latest customer installer is v1.0.15; whole Master Vision estimate remains historical provisional ~51%. This source fix does not accept A-FIRST-CUSTOMER or claim a new customer release.
