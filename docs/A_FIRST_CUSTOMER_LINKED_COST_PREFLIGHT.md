# A-FIRST-CUSTOMER — Linked expense/purchase preflight before journal

An expense or direct purchase linked to a service order used to post a source financial journal first, then call `addOrderExpense`. If the linked order had an unrepresentable existing total or exceeded safe cents, `addOrderExpense` rejected the update. Expense creation could leave a posted journal and expense master even though the API reported an error; direct purchases ignored the error altogether.

This change extracts the existing order expense consistency checks into `preflightOrderExpenseAddition`, which is **read-only** and is reused by `addOrderExpense`. The shared expense/purchase store calls it before posting either financial journal or mutating supplier payables. A malformed order total or overflowing combined cost now fails closed before any accounting, master or outbox write. The normal addition still performs the same validation when mutating the order.

Regression tests execute the real domain stores and prove invalid totals, fractional-cent corruption and sum overflow block both expense and direct purchase atomically. A positive case proves correct linked totals, payable and balanced journals. Unexpected failures after a successful financial commit remain a separate transaction-boundary concern.

No new database migration, paid dependency, production deployment or Windows installer release. Refs #325.
