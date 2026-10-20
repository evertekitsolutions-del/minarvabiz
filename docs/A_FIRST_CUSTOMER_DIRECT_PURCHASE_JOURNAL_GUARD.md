# A-FIRST-CUSTOMER — direct purchase ledger commit guard

Legacy `phase5Store.createPurchase` mutated the order's expense aggregate, consumed a purchase number, incremented supplier payables, and created a purchase before calling `planDirectPurchasePosting().commit()`. It ignored a missing/null accounting receipt, so purchase and payment totals could drift from the source journal after failure.

The direct-purchase journal is now committed before any of those operations. When posting returns null, creation returns an explicit error with no purchase, supplier or order changes, no number consumption and no follow-on remote purchase write. If commit throws before posting, the existing caller exception path handles the error without changing those business aggregates. Positive path and permissions remain unchanged.

Regression tests use the actual TS business store and inject missing / throwing accounting commits, checking that purchase, supplier, linked service order, journal and outbox state are unchanged. A success test verifies the expected balancing journal, payable and order expense.

No production migration, deployment, runtime dependency, paid infrastructure or Windows installer release. Installed Windows/Online/Hybrid customer acceptance is a separate gate.
