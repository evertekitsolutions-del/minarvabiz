# FIN-013 — Posted Journal Cash & Bank Flow (vertical cut)

The Web and Windows Reports & Analytics panel includes a permission-gated Cash / Bank Flow tab with an opening balance, period inflows and outflows, net change, closing balance and journal-level breakdown. Uses the existing first-party accounting journal source and exact minor units. Internal cash-to-bank transfers have zero consolidated net effect. Existing date filters and CSV/Excel/PDF exports are supported.

Only posted/void journal entries are considered; a voided original and its separately posted reversal cancel in aggregate. Drafts are excluded. The host supplies authorized active-branch scope; callers cannot nominate another branch. The reader requires accounting.view at domain level.

**Partial FIN-013:** not yet a statutory IAS 7 direct/indirect Cash Flow Statement. No reviewed operating/investing/financing categorization, separate cash equivalents, or bank statement reconciliation. Not all custom cash/bank accounts are included (only systemKey cash and bank). No migrations, paid services, extra transaction writers or production deployments.
