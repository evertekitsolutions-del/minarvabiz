# A-FIRST-CUSTOMER — Customer opening receivable setup UI

- Rebased existing draft PR #526 onto current main without replacing other merged work.
- Web and Windows customer lists expose the shared, permission-gated `setOpeningCustomerBalance` workflow. It posts AR ↔ Opening Balance Equity through existing domain logic with audit history, not a collection/payment.
- This revision snapshots the displayed receivable when opening the dialog and compares it against the latest in-memory customer total before making a ledger posting. Stale forms must reopen rather than overwrite a concurrently changed balance. Domain permission checks stay authoritative for local mode.
- Product/customer/supplier CSV contracts remain master-only; do not silently import unverified financial amounts.
- No migration, extra dependency, production tenant write or Windows installer release.
- Remaining acceptance: authenticated Online/Hybrid financial-sync reconciliation, cross-device concurrency, real customer opening-balance UAT and installed Windows checks. No claim of complete first-customer release.
