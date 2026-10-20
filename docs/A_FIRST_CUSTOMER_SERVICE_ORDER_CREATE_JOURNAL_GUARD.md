# A-FIRST-CUSTOMER — Service order creation journal receipt gate

Service-order creation previously updated customer balances, consumed the order number, inserted the operational order, and only then called the accounting plan's `commit()` without checking whether it produced a journal receipt. A null/throw created unposted debt or recorded customer advances without corresponding debit/credit.

For nonzero charge, the order now requires a non-null posting receipt **before** any customer/order/payment mutation. Zero-charge orders retain the existing no-journal behavior. Tests cover null/throw on unpaid and prepaid orders, happy-path accounting and free-of-charge orders. This is synchronous fail-closed behavior, not a claim of crash-safe multi-store ACID or remote write atomicity.

No production migration, deployment, hosted database changes, new dependencies or installer release. Refs #325.
