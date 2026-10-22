# PUR-008 / INV-005 — Posted Goods Receipt Batch Attribution

**2026-10-22 | Windows Offline operational feature**

## Customer workflow

The shared Procurement screen now offers **GRN batch and expiry trace register** after the existing purchase, receipt, invoicing and supplier-payment controls.

1. Select an **already posted** Goods Receipt / GRN and linked product line.
2. Record supplier batch/lot code, expiry date and received units to three decimal places.
3. The sum of active batch amounts for one GRN line **cannot exceed** the quantity actually posted on that GRN line. Screen shows covered / uncovered quantity.
4. Corrections **void** the original attribution with a mandatory reason and optimistic revision guard. Prior entries remain in the backup and audit history.
5. The existing Windows SQLite `domain_snapshot_v2` and manual backup/restore include `grnBatchAttributions` with strict validation before replacing in-memory state. Pre-feature snapshots restore cleanly with an empty register.
6. `purchases.manage` is required to write and `reports.view` to read; records are stamped to the active branch, cannot be added to a foreign-branch GRN, and never accept a caller-supplied product, location or quantity ceiling. Historical GRNs can have an unlocated warehouse line, kept explicitly as `null`.
7. Production Web editing is **disabled** unless the installed Windows SQLite runtime is available; there is no pretend cloud persistence.

## Safety boundary

**GRN stock posting already happened. This module NEVER posts stock twice.** It persists provenance and quantity coverage only; it is not an atomic batch-aware inventory ledger and cannot block an expired-batch sale or update actual local lot counts. Existing expiry reminders, counted-lot worksheet and transaction pilot remain independent until a trusted unified warehouse/lot writer is implemented.

No automatic creation of expiry reminders: that would require an atomic shared transaction with the provenance record. Entering the same batch in different registers does not prove physical equivalence. User must compare batch codes and actual physical inventory before use.

No new database migration, cloud table, Supabase RLS, paid dependency, customer installer, hosted deployment, or Master Vision completion % is claimed.

## Exact-head tests

`node --test packages/business-logic/src/__tests__/grn-batch-attribution.test.mjs`

`pnpm --filter @minarvabiz/business-logic typecheck`

`pnpm --filter @minarvabiz/ui typecheck`

Then full GitHub CI, Windows packaging, installed smoke, coverage, licensing, security, post-merge `main` CI before release. Source revert is safe; old domain backups remain compatible.
