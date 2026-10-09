# HR-004 shift template soft lifecycle

Baseline `d44a85bd346adeb2f036265580723a4011c2eb15`. Reuse the existing shared React RosterPlanner, `phase6Store.updateShiftRule`, revisioned PostgreSQL `apply_staff_roster_event`, SQLite snapshot and audit/outbox.

- Authorized Windows users can **deactivate or reactivate** a shift template with a separate explicit confirmation. The operation preserves the prior template's identity, branch, times and unpaid break and changes only the active flag using the existing versioned/audited host callback.
- Inactive templates remain visible and in historic rosters; new assignments using them remain prohibited by both shared engine and PostgreSQL guard. Previously scheduled slots can still be cancelled or corrected in a supervised workflow.
- Web roster UI is currently read-only; its shared lifecycle buttons stay disabled until browser conflict reconciliation is implemented. No false parity claim.
- Unit/contract coverage verifies permission UI guard, confirmation, audit-preserving mutation route, cancelled historical entries and inactive-creation rejection.
- No paid services, new libraries, production schema changes, hard deletion, or customer fixtures.
- Remaining HR-004: Web authorized writes with durable conflict resolution, branch timezone enforcement, recurring batch approval, production tenant UAT, Windows installed feature acceptance.
- Full Master Vision baseline remains approximately **51%**.
