# First-customer checkout: branch warehouse stock consistency

Baseline: main `5de0a298e0fab63c6ecfe2a2b09e36dcdbe46d3c` (PR #374).

## Reproduced failure and fix

The shared checkout guard counted company-wide warehouse availability, while
`consumeWarehouseStock` deducted only allocations belonging to the product's
branch. A branch A product with total stock 10 and 8 units allocated to branch B
could sell 3 units, leaving product total 7 while the untouched B allocation
still contained 8. The same mismatch affected a mix of own-branch reserved
stock, foreign allocation and unallocated stock.

The guard now passes the live product branch into `warehouseSaleableQuantity`.
Its physical availability uses the same branch selection as stock consumption,
plus genuinely unallocated product stock calculated across all warehouses.
The existing total, reserved and in-transit caps remain. Missing branch scope
retains the existing company-wide behavior; this is not a new authorization
model or full Sync v2 branch-ownership implementation.

Existing Minarva code is reused. No dependency, migration or paid service added.

## Verification

- Both new behavioral tests failed against the baseline because invalid sales
  were accepted, then passed with the fix.
- First-customer suites: 81 tests passed.
- Full business-logic Node test sweep: 269 test entries passed, zero failures.
- Business-logic TypeScript check and `git diff --check`: passed locally.
- The tests assert denied operations do not change stock, customer, payments,
  accounting or outbox; valid own/unallocated sales preserve foreign allocations
  and reservations and retain balanced accounting.

PR exact-head CI, independent review and postmerge CI are separate gates. Real
licensed Windows, printer, Online/Hybrid customer UAT and a signed installer
release remain outstanding; do not infer them from these tests. Historical full
Master Vision estimate stays approximately 51%, provisional. Published customer
installer remains v1.0.15 pending independently verified release evidence.
