# A-FIRST-CUSTOMER — Zero-charge service order cancellation

The new journal-first cancellation receipt gate correctly blocks financial cancellations with missing reversal journals, but it also unintentionally blocked a legitimate ₹0 service order. Such orders have no opening accounting journal.

The cancellation planner now returns a no-journal plan only when `price = advance = balance = 0` and no unexpected posted creation journal exists. The order workflow applies cancellation with no reversal receipt only for a zero-charge order. Paid orders still fail closed when no journal receipt is returned.

Actual domain tests cover newly created and legacy free orders, missing paid posting reconciliation and unexpected journal evidence. No refund is invented. No production database changes, migrations, deployment, license or Windows release. Refs #325.
