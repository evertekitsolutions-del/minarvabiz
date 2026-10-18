# UBP-05p — financial acceptance for dimensional multi-cut billing

This milestone tests the already merged Normal Billing and POS multi-cut
cart contracts at the **actual local financial posting boundary**,
rather than relying only on individual cart or preview unit tests.

The suite creates two cuts (3 sqft and 1 sqft) of the same SKU, prices
them independently (100 and 200 per sqft), and pays a 500-unit invoice
through card (350) and cash (150). Both the POS path and Normal Billing
path must preserve independent sale-item IDs, distinct immutable
measurements, one aggregate stock debit of 4 sqft, exact settlement
receipts, one balanced accounting journal and offline snapshot audit.

Corrupt dimensional metadata, quantity drift and cumulative overstock
must fail before mutation of sales, stock, customer balances, payments,
journals or the outbox. In an unconfigured cloud environment, local
posting must not be mistaken for a remotely acknowledged financial
transaction.

Regression:
`packages/business-logic/src/__tests__/multicut-financial-reconciliation.test.mjs`

This is not proof of production-ready cross-device sync. Separate
customer acceptance and staged server deployment are still necessary
for UBP-05c/e/g migrations, Windows offline/online/hybrid reconciliation,
recovery after device re-enrollment, posted-return reversals and
invoice/thermal print review. No hosted database mutation or installer
release takes place in this PR.
