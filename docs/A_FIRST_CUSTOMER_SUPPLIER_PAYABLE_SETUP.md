# A-FIRST-CUSTOMER — Supplier payable onboarding UI

The master onboarding checklist already contains "Add suppliers and opening payables" and a ledger-backed `setOpeningSupplierBalance` function. This change exposes that existing authority from the authenticated Web supplier list and Windows Purchases supplier list.

- Permission gate: `settings.manage` on both clients; the domain poster independently checks the same permission.
- Source of truth: `phase5Store.getSupplier(id)` immediately before posting, compared with the dialog's immutable `outstandingBalance` snapshot in integer cents.
- The input is the verified **total current outstanding payable**, not a payment or additional charge. Adjustments post the delta to Accounts Payable / Opening Balance Equity through the existing audited function. Existing purchases and payments must be reconciled before operator correction.
- No new transaction state or direct stock write. Post uses current shared store and the existing persistence/outbox flows. Windows awaits `persistAndRefresh` before claiming UI completion.
- Permission, stale-form and audited-posting wiring is covered by the first-customer onboarding regression suite; opening-supplier-accounting tests cover AP/equity, rollback guards, cents, idempotency, permissions and outbox.
- No production DB migration, release, paid service or vendor-specific dependency.
- Onboarding remains operator-confirmed, **not** certified commercial UAT. Real Windows/Offline/Hybrid opening-balance and backup/recovery acceptance are outstanding.

## Clean-room hotspot budget fix

The first CI run identified a Windows App.tsx source-hotspot byte overage. The supplier Add action now opens the pre-existing modal without repeating its full default-state object in the central App (the form is already initialized/reset after save and retains a cancelled draft for editing). Source-hotspot budget is unchanged.
