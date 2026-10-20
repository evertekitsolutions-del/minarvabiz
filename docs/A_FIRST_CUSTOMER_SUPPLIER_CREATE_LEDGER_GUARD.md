# A-FIRST-CUSTOMER — Supplier opening payable creation safety

Previously `phase5Store.createSupplier` appended the supplier master to the live array before committing its opening Accounts Payable / Opening Balance Equity journal. A null receipt rolled back the array manually, but an exception from the journal commit leaked an unposted supplier. A later persistence or backup could then capture a supplier whose opening balance has no ledger.

The supplier is now added only after a non-null journal commit. Both missing and thrown commits leave supplier records and subsequent remote outbox/creation unchanged. Existing domain validation, permissions and financial precision are retained.

Executable regression tests inject missing/throwing ledger commits into the real supplier creation path and assert that supplier/journal/outbox state is unchanged. A success path confirms payable, supplier and balanced ledger.

No schema migrations, paid dependencies, production changes or Windows installer release. This addresses first-customer safety, not installed UAT or full master vision completion.
