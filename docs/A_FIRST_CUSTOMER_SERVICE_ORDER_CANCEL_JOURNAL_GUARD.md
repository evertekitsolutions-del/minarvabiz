# A-FIRST-CUSTOMER — Service-order cancellation journal guard

Service-order cancellation previously reduced customer receivables, set order status to `cancelled`, and only then called the reversal plan's `commit()` without checking its return value. A null journal receipt could silently cancel the order and issue a refund without corresponding ledger reversal.

The cancellation path now requires a non-null journal receipt **before** customer/order mutation, refund record, outbox work or communication. Four regression scenarios exercise actual domain stores: null return with/without an advance, thrown commit, and normal paid cancellation with a single balanced journal and correct refund.

This does not claim full crash-safe or distributed ACID across the journal, SQLite snapshot, renderer side effects and customer communication. The next architecture stage must make the post-journal state transition durable/recoverable. No migrations, hosted Supabase writes, deployment, installer release, or new paid dependencies. Refs #325.
