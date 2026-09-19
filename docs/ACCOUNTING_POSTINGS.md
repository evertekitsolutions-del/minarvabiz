# Automatic accounting postings — Step 4C

The first operational posting adapter covers **new paid expenses** created through
`phase5Store.createExpense`, shared by Online, Windows and Hybrid. Older expenses
are not backfilled during hydration or restore. Sales, purchases, settlements and
source expense corrections remain separate follow-up steps.

| Expense | Debit | Credit |
| --- | --- | --- |
| General, cash | General Expenses | Cash |
| Order-specific, cash | Order-specific Expenses | Cash |
| Bank transfer | Corresponding expense account | Bank |
| Card / UPI / online / other | Corresponding expense account | Payment Clearing |

Payment Clearing is a temporary settlement account. It does not assert that a
particular bank account or credit-card liability has already been reconciled.
Existing expense records do not contain an input-tax breakdown; this adapter
posts their full recorded amount without inventing tax-credit amounts.

Each journal is posted once with `referenceType=expense` and the source expense
ID. Repeating the same posting returns the existing journal; a conflicting replay
is rejected. Automatic expense journals cannot be voided through the manual
journal action. Their future corrections must keep the source record and ledger
consistent.

Validation occurs before posting or queuing mutations. Source expense and journal
state use the existing domain snapshot/SQLite persistence. Expense, required
accounts, journal and lines enter the existing outbox synchronously. Online writes
run expense -> accounts -> journal/lines; failure leaves pending outbox records.
This is retryable asynchronous synchronization, not a cross-table server transaction.
No schema or snapshot-version change is required.

Verification includes executable shared-store tests for permissions, idempotency,
invalid inputs, payment mapping, linked-order costing, state restore, dependency
ordering and network failure. Web and installed-Windows smoke create a 50-unit
expense and assert -50 net profit before any manual journal, then -150 after a
100-unit manual journal. Existing build, licensing and UI workflows remain gates.

Next: controlled Sales/POS posting including tenders, receivables, tax and returns;
then procurement invoice/payment posting. Do not backfill historic documents
without an explicit cutover/reconciliation workflow.
