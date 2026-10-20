# A-FIRST-CUSTOMER — Expense source journal receipt

Previously `phase5Store.createExpense` inserted the expense master before executing `postExpenseJournal`. An expected validation error removed it, but a thrown journal exception retained a phantom expense. In addition, `{ journalEntry:null, errors:[] }` was treated as success.

The new create sequence requires a non-null posted journal receipt before inserting the expense master. Both expected posting errors and an empty receipt fail closed; a thrown pre-commit exception does not leak an in-memory expense. Existing domain permissions and ledger validation are authoritative. The existing combined remote expense/journal writer still receives the full immutable expense argument.

Tests run the real TypeScript store, injecting failed, missing and thrown receipts and asserting unchanged expenses, ledgers and outbox. The successful path remains balanced. This change does not solve separate linked-order aggregate failure after a successful accounting post; that requires a distinct transactional acceptance cut.

No production migration, new dependency, hosted infrastructure, or installer release.
