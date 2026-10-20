# A-FIRST-CUSTOMER — journal-first expense reversal and safe order cost subtraction

The legacy `reverseExpense` function removed linked order costs and marked the source expense deleted before calling `planExpenseReversal().commit()`. If that commit returned null or threw, the accounting ledger retained the debit/credit while the expense disappeared, misrepresenting operating costs and backup/sync state.

The shared order store now exposes **read-only** `preflightOrderExpenseRemoval`, validating source identity, money precision, live order total and exact remaining cents. `removeOrderExpense` reuses this guard and applies subtraction in integer cents. Expense reversal preflights any linked order, requires a **non-null reversal journal receipt** before removing costs or archiving the source, then updates sync and audit state.

Five actual-domain regression tests simulate null and thrown accounting commits, corrupt order cost, invalid expected removal amounts, and balanced successful reversal. Known validation failures are fail-closed. An unexpected fault after the committed journal remains a distinct durable-transaction acceptance risk; this is not a claim of end-to-end distributed ACID.

No production database changes, deployments, published installer, paid dependency or external services. Refs #325.
