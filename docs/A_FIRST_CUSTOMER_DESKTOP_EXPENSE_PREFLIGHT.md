# First-customer Windows expense preflight

The Windows Add Expense form used `parseFloat(raw) || 0` for the amount. This could silently turn a partially valid numeric prefix, for example `"42bad"`, into a real expense posted to the accounting ledger, despite the operator having entered an invalid amount.

The Windows handler now uses the shared exact-cent amount validator already integrated for purchases, at the point before calling `phase5Store.createExpense`. It rejects malformed, negative, over-precision, empty and unsafe amounts rather than sending coerced values to the domain. The existing domain journal remains authoritative. No duplicate parser, new runtime dependency or schema is introduced, and the desktop entry file remains below its 60,000-byte hotspot gate.

Regression tests invoke the production renderer handler with controlled persistence and domain stubs. No production deployment or new Windows installer release.
