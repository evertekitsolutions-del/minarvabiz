# First-customer Windows supplier creation — fail-closed input

Earlier Windows Create Supplier coerced malformed form input using `Number(raw) || 0`.
If the numeric conversion produced `NaN`, the fallback silently replaced the
intended opening payable with zero. In contrast, the existing Web path already
hands invalid numeric input to the domain for explicit rejection.

This cut passes `Number(raw)` unchanged to the existing
`phase5Store.createSupplier` validation; its finite, safe-cent and
non-negative checks reject malformed input before supplier/ledger/outbox
mutation. Empty input retains the existing zero-opening-balance behavior.
The unchanged catch displays domain validation failure to the operator.
No DB migration, new accounting engine, or release.

A regression harness executes the actual Windows supplier-create handler with
UI boundary stubs; existing supplier-create accounting tests exercise the
real domain guards and journals. Acceptance still requires installed Windows
onboarding with backup/restore and Online/Hybrid UAT.
