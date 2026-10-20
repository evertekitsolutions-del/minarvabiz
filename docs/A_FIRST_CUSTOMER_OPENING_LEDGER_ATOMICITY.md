# A-FIRST-CUSTOMER — atomic opening balance ledger acknowledgement

Before this cut, the existing customer and supplier opening-balance setters assigned the new live outstanding balance *before* invoking `planAutomaticPosting().commit()`, ignoring a missing journal receipt. If that local accounting commit returned `null` (or threw), the master could drift from Accounts Receivable / Accounts Payable while a remote upsert and audit were still attempted.

Both setters now require a non-null balancing journal receipt **before** mutating the customer/supplier, publishing the cloud master, or emitting the follow-up opening-balance audit. The source plan's existing permission, precision and account validation remains unchanged.

Regression tests inject null/throwing accounting commits into the actual shared domain setters; every failure must leave masters, journals and outbox identical to the pre-attempt snapshot. Success still produces balanced account journals and correct amounts.

No schema migration, production operation, paid dependency or Windows installer release. Real installed Windows, Online and Hybrid acceptance remains pending.
