# A-FIRST-CUSTOMER — Direct purchase order cost source identity

For an order-linked direct purchase, the purchase record had a generated `purchase.id`, but the linked service-order cost entry received a second random ID from `addOrderExpense`. This prevented operators and reconciliation tools from reliably tracing an order cost back to its source purchase and made source-aware duplicate checks unusable.

New order-linked purchases now pass their `purchase.id` both to the existing preflight and the order expense insertion. The domain’s duplicate-source check rejects a second application of that source identifier without changing the order, outbox or ledger. Existing historical linked entries retain their prior IDs; no automatic rewrite or migration is attempted. This **does not** make a repeated `createPurchase` request idempotent, because it still generates a fresh purchase ID.

Regression tests run actual stores and verify exact source identity, supplier payable, accounting balance, and replay prevention for the same source ID. No paid infrastructure, production migration, deployment or installer release.
