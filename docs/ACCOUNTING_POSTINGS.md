# Automatic accounting postings — Step 4C

The first operational posting adapter covers **new paid expenses** created through
`phase5Store.createExpense`, shared by Online, Windows and Hybrid. Older expenses
are not backfilled during hydration or restore. Sales lifecycle postings are described below. Purchases and source expense
corrections remain separate follow-up steps.

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

Next: procurement invoice/payment posting and controlled opening-balance reconciliation. Do not backfill historic documents
without an explicit cutover/reconciliation workflow.

## Sales posting prerequisite — customer collections

Customer collections now allocate to oldest unpaid sales first (sale date,
creation date, then ID). Each allocation updates invoice paid amount, balance,
status and version. Cancelled, returned, deleted and other-customer invoices are
excluded. Remaining collection value reduces other/opening customer balance;
it is not invented as a sale payment. Payment notes and audit entries preserve
the invoice allocations using existing persistence fields.

The shared collection path queues payment, customer and settled invoice snapshots
before online I/O. Online uses settlement-only invoice updates, and writes are
serialized to prevent an older request overwriting newer balances. The web page
no longer performs a second payment insert. Failure leaves outbox work pending.
This does not retrospectively repair old unallocated collections and does not
backfill prior sales or collections to the general ledger.

Regression: a 100-unit invoice paid 10 initially and collected 90 later must show
paid 100, balance 0, completed. A subsequent full return refunds 100 and reduces
receivables by zero. Web and installed-Windows smoke assert the rendered invoice
amounts after collection before continuing through refunds.

## Sales posting prerequisite — invoice-valued returns

Return and exchange credit now use the original recorded `SaleItem.lineTotal`,
which includes the line discount and tax. They do not use the caller's unit price
or the current product price. Old snapshots without line totals fall back to the
original invoice quantity/price/discount/tax fields.

Partial returns use cumulative returned quantity and deduct prior recorded refund
amounts in integer cents. The final return consumes the remaining line value,
avoiding rounding loss across repeated or fractional fabric returns. Restored
completed return history participates in the same calculation. Invalid quantities,
duplicate selected lines, mismatched products, inconsistent invoice balances and
unavailable invoices are rejected before mutation. Historic inconsistent returns
are not silently rewritten; negative residual values require reconciliation.

The shared Returns panel uses the same quote for its preview and shows remaining
returnable quantities. Both Web and installed-Windows smoke now create a 100-unit
sale with 10% discount, verify the 90-unit return preview, and submit the refund.
Runtime tests additionally cover taxed invoices, combined discount/tax, partial
credit invoices, zero-value lines, fractional quantities, restore and exchange
credit/refund differences. Automatic Sales/POS GL posting is now described below.

## Automatic Sales/POS lifecycle posting

New invoices now post through the shared core on Web, Windows and Hybrid. This
includes zero-paid issued credit sales (the operational status is `draft`, but
stock has already been issued). Held carts never post. Original sale-item cost
and tax are used; later product price changes do not change a posted invoice.

| Event | Debits | Credits |
| --- | --- | --- |
| New sale | Actual cash/bank/clearing receipts, receivable, exchange credit used | Net product revenue, recorded tax payable |
| Stock issued | Cost of Goods Sold | Inventory Asset |
| Customer collection | Cash/bank/clearing | Receivables for posted invoices; legacy/unallocated clearing for remainder |
| Return of posted sale | Product revenue, tax payable | Paid refund (or exchange-credit liability), receivable reduction |
| Restocked return | Inventory Asset | Cost of Goods Sold |
| Exchange excess refund | Exchange Credit Payable | Cash/bank/clearing |

Card, UPI, online and other tenders use Payment Clearing. Cash change is excluded
from receipts. Returned goods that are not restocked retain their consumed cost.
Tax and restocked cost reversals use cumulative integer-cent allocation so repeated
partial returns reconcile to the original posting. Replacement invoices consume
exchange credit as a liability; they do not invent another cash receipt.

Historical invoices are not posted during hydration. Their new paid refunds debit
Legacy / Unallocated Settlement Clearing, while new collections against historical
or other customer balances credit it. No historical revenue, tax, COGS or receivable
reversal is invented. This account is a reconciliation placeholder, not income.
Opening inventory, bank/cash, receivables and clearing balances must be reconciled
before financial statements can be treated as complete. Procurement, service and
laundry recognition are not yet automatic.

Accounting plans validate account availability and balancing before source
mutations. Source-linked posted entries cannot be manually voided. Source replay
is idempotent and conflicting replays are rejected. Every source posting queues
its accounts, journal and lines synchronously; online journal writes wait for
accounts. Network failures retain outbox work. This uses existing snapshot/SQLite
and online schema, with no historical backfill or new schema version. Remote
source and journal synchronization is retryable, not a server-wide transaction.

Runtime tests cover actual store sale -> collection -> return, exchanges including
excess refunds, split tenders/change, credit and free invoices, rounding, restore,
permissions, idempotency, unavailable accounts and network failure. Web and Windows
smoke assert 40 net profit for a 100 sale costing 60, then -50 after returns and a
50 expense, and -150 after an additional manual 100 expense journal.

## Procurement posting prerequisite — supplier settlement allocation

General supplier payments allocate to oldest unpaid direct purchases and posted
supplier invoices (document date, then ID). Draft/cancelled invoices, deleted
purchases and other suppliers are excluded. Remaining value reduces the supplier's
other/opening balance and is labelled in payment notes; no invoice is invented.
Invoice-specific payments settle only that invoice and update it by the actual
amount capped against both supplier and invoice balances. AP aging updates with
these invoice balances, preventing later duplicate invoice payments.

The complete allocation is validated before mutation. Invalid amounts, methods,
dates, document balances and unavailable selected invoices are rejected. Payment
notes and audits retain document allocations. Source updates are queued together
and online writes are serialized (payment, invoices, direct-purchase settlement
updates, supplier) so slower earlier requests do not overwrite newer balances.
No duplicate payment/purchase inserts are added, and failures retain pending outbox
records. This is asynchronous persistence, not a server-side atomic transaction.

Runtime regressions cover partial/full FIFO, selected invoices, actual supplier
caps, direct purchases, other balances, aging, restore, validation, permissions,
serialized online writes and offline failures. Web smoke creates/posts an invoice,
pays part from the invoice and settles the remainder from the supplier screen;
Windows smoke checks partial and full invoice payments. This step does not yet
add procurement GL postings or reconcile historical unallocated supplier payments.
