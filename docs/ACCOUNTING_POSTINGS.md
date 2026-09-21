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
before financial statements can be treated as complete. Service-order and laundry recognition are covered below; supplier invoice recognition
is covered below.

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

## Supplier invoice and payment posting

Newly posted procurement invoices now debit Inventory Asset for product-linked
lines, Unclassified Purchases for description-only lines, and Purchase Tax Pending
Review for recorded tax; they credit Accounts Payable. Tax is not automatically
classified as eligible statutory input credit. Unclassified purchase values need
review into their proper expense/asset account.

This step recognizes purchases at supplier-invoice posting. PO, GRN and draft
invoice creation do not post journals. GRNs remain the only stock-quantity mutation;
posting/cancelling an invoice does not receive/return stock again. Unbilled GRN
accrual, valuation adjustments for goods sold before invoicing, purchase-return/debit-note accounting remain follow-ups. Financial
statements still require these and opening-balance reconciliation before completion.

New supplier payments debit AP only for allocations to invoices or direct purchases with an automatic
source posting. Other/legacy allocations debit Legacy / Unallocated
Settlement Clearing instead; all credit cash, bank or Payment Clearing according
to actual tender. Invoice-specific and general supplier-screen payments use the
same posting path, validation, snapshot and outbox persistence.

Unpaid posted invoice cancellation creates an exact inverse of its original
journal dated on the cancellation day. Original journals remain immutable; paid
invoices cannot be cancelled. Historical invoices with no source journal are not
backfilled or given an invented reversal. Missing accounts, inconsistent amounts
or supplier balances reject before source mutation. All automatic entries retain
source IDs and are protected from manual void.

Executable tests cover actual PO -> GRN -> draft -> post -> partial/full payment,
cancellation, immutable stock quantities, tax review, permissions, account failure,
restore, replay, legacy clearing and offline queueing. Web smoke checks AP credit
300 -> 510 -> 410 -> 0; installed Windows checks 120 -> 100 -> 0 through rendered Trial
Balance while preserving the full existing module smoke sequence.

## Direct purchase posting

New direct purchases debit Unclassified Purchases for their total, credit the
actual Cash/Bank/Payment Clearing tender for the capped paid amount, and credit
Accounts Payable for the unpaid balance. A supplier is required for credit.
Description-only purchases do not imply product quantities or tax eligibility;
classification into the appropriate asset/expense account remains a review task.
Order-specific purchases still update the existing order-cost calculation once.

Posting is validated before purchase, supplier, order or outbox changes. Automatic
source entries cannot be manually voided. Subsequent supplier payments reduce AP
only for purchases with a matching source journal; historical purchases continue
through Legacy / Unallocated Settlement Clearing. No historical backfill occurs.
Purchase creation and supplier settlement remote writes share an ordered queue,
with immutable snapshots and offline outbox retention. The source and journal
writes are still separate server requests, not an atomic server transaction.

## Manual journal validation

Manual drafts reject negative, non-finite or out-of-range amounts, empty line
sets, and invalid calendar dates before any journal/outbox mutation. Unbalanced
drafts can still be saved but cannot be posted. Posting rechecks active accounts,
amounts, dates, balanced lines and stored totals, including restored drafts.
Rejections leave drafts and financial statements unchanged. Web and installed
Windows smoke both reject a negative draft, then correct and post it successfully.


## Purchase return posting

New purchase returns validate finite quantity/amount, available stock, supplier
existence and supplier outstanding before any stock, supplier or ledger mutation.
A return cannot silently create a supplier receivable; amounts above the current
supplier outstanding are rejected until a dedicated supplier-credit workflow is
implemented.

Returns linked to a source that already has an automatic purchase posting debit
Accounts Payable. Older or unlinked returns debit Legacy / Unallocated Settlement
Clearing instead, so historical AP is not invented. The balancing credit goes to
Purchase Returns Pending Review, a contra-asset holding account. This reduces net
assets without guessing the original inventory-versus-tax split; an accountant
can later reclassify it to Inventory Asset, Purchase Tax Pending Review or another
appropriate account.

Physical stock is reduced once through the existing inventory movement. Supplier
outstanding is reduced by the same validated credit, the supplier snapshot is
queued for sync, and accounts/journal/lines use the existing automatic-posting
outbox. Hydrated historical returns are not backfilled.


## Opening cash posting

First-time opening cash now creates the cash-register opening and its general-ledger
opening balance together. A positive opening amount debits Cash and credits Opening
Balance Equity on the business date. Zero opening cash may open the register without
creating a zero-value journal.

Invalid, negative, non-finite or out-of-range amounts are rejected before the
cash-register session is created. The posting plan also validates the required
accounts first, so an unavailable Cash or Opening Balance Equity account leaves
the register and ledger unchanged. Repeating the setup for an already-open day is
rejected by the existing cash-register control; historical cash sessions are not
backfilled.


## Opening customer balance posting

Setting a customer's opening outstanding balance now reconciles Accounts Receivable
to the operational customer balance through Opening Balance Equity. Increasing the
opening balance debits Accounts Receivable and credits Opening Balance Equity;
reducing it posts the exact reverse delta. Setting the same value again is a no-op
and does not create another journal.

The target and existing balances must both be finite, non-negative, cent-safe
amounts. Required posting accounts are validated before the customer is mutated.
The updated customer snapshot and automatic journal are queued through the existing
remote/outbox paths. Historical customer balances are not backfilled automatically;
this posting occurs only when the opening-balance action is explicitly used.


## Opening supplier balance posting

Setting a supplier's opening outstanding balance now reconciles Accounts Payable
to the operational supplier balance through Opening Balance Equity. Increasing the
opening amount debits Opening Balance Equity and credits Accounts Payable; reducing
it posts the exact reverse delta. Setting the same value again is a no-op and does
not create another journal.

The target and existing balances must both be finite, non-negative, cent-safe
amounts. Required posting accounts are validated before the supplier is mutated.
The updated supplier snapshot and automatic journal are queued through the existing
remote/outbox paths. Historical supplier balances are not backfilled automatically;
this posting occurs only when the opening-balance action is explicitly used.


## Opening stock valuation posting

Setting opening stock now reconciles the operational product quantity to Inventory
Asset using the product's recorded cost price. Increasing opening quantity debits
Inventory Asset and credits Opening Balance Equity for the rounded quantity delta
times unit cost; reducing quantity posts the exact reverse valuation. Setting the
same quantity again is a no-op.

Target/existing quantities must be finite, non-negative and safe to three decimal
places so fractional fabric quantities remain supported. Product cost must be a
finite, non-negative cent-safe amount. Required accounts are validated before the
stock mutation. A zero-cost product may change quantity without creating a zero
value journal. Historical stock is not backfilled automatically; this posting only
occurs when the opening-stock action is explicitly used. This uses recorded product
cost and does not introduce FIFO/weighted-average valuation in this milestone.


## Laundry order posting

New laundry and in-house ironing orders now post from the shared core when the
order is created. Customer receipts debit Cash, Bank or Payment Clearing according
to the recorded tender; unpaid customer value debits Accounts Receivable; the full
customer charge credits Laundry Revenue.

For outsourced laundry, the recorded supplier cost debits Laundry Outsourcing
Costs and credits Accounts Payable. In-house ironing forces supplier cost to zero.
The resulting profit-and-loss effect therefore reflects laundry revenue less the
recorded outsourced cost without inventing inventory movements.

Quantity, customer/supplier rates, paid/balance amounts, customer balance and
supplier balance are validated before source mutation. The existing UI cash
default is preserved when no payment method is supplied. Missing customers,
required suppliers, unavailable accounting accounts, corrupt balances and
non-finite/out-of-range amounts reject without creating the order or journal.

The source order, changed customer/supplier snapshots, accounts, journal and
journal lines use the existing persistence/outbox paths. Automatic laundry journals
cannot be manually voided. Hydrated historical laundry orders are not backfilled.
Status changes, cancellations/refunds and service-order revenue recognition remain
separate follow-up milestones.


## Service order posting

New tailoring, alteration, wedding, wholesale, uniform and T-shirt service orders
now post when the order is created. The current service-order UI does not expose a
payment-method selector, so the recorded advance is treated as Cash; the unpaid
balance debits Accounts Receivable and the net order price credits Service Revenue.

The order's price, discount, advance, quantity and other pricing inputs must be
finite and in range. Calculated price, advance and balance are validated again
before posting, and the customer outstanding/total-spending state must be
reconcilable before any source mutation. Required accounting accounts are also
validated first.

The created order, changed customer snapshot, accounts, journal and journal lines
use the existing persistence/outbox paths. Automatic service-order journals cannot
be manually voided. Hydrated historical orders are not backfilled automatically.

This milestone recognizes service revenue only. It does not yet invent accounting
for estimated external material cost, T-shirt printing cost, later order expenses,
status transitions, cancellations/refunds or a selectable advance tender; those
remain separate source-driven follow-up workflows.


## Service order cancellation posting

The existing Service Order **Cancel** action now uses a source correction instead
of changing status alone. For an automatically posted order with no advance, the
system creates an exact inverse of the original `auto_service_order` journal,
reduces the customer's outstanding balance by the still-recorded order balance,
and only then marks the order cancelled. The original journal remains immutable.

Cancellation is intentionally blocked when the order has an advance, because the
current service-order UI has no explicit refund tender/workflow and the system must
not invent a cash refund. It is also blocked for historical orders with no source
journal, unavailable posting accounts, insufficient/corrupt customer balances, or
when a post-order customer collection contains an unallocated "Other customer
balance" amount. Those cases require allocation/refund/reconciliation first.

Successful cancellation queues the changed order and customer plus reversal
accounts/journal records through the existing outbox paths. Other service-order
status transitions remain operational status changes only and create no accounting
journal. No historical cancellation backfill is performed.


## Service order detail expense source

The Service Order detail **Order-specific expense** action now creates a real Expense
source document instead of only changing the order profit helper. The operator must
select an expense category and the actual payment method (Cash, Bank, Card, UPI,
Online or Other), then enter the amount and optional description.

The existing expense accounting engine is reused: the source expense debits
Order-specific Expenses and credits Cash, Bank or Payment Clearing according to
the selected tender. Only after the source and journal validate does the linked
service order receive the matching order-expense cost. The linked order update is
also queued in the hybrid outbox so online/offline editions converge on the same
order cost.

Invalid, non-finite, non-positive or sub-cent direct order-expense amounts are
rejected without mutating the order. Existing Expenses-page order linking uses the
same accounting path; this milestone removes the detail-page accounting bypass
rather than introducing a second posting model.
