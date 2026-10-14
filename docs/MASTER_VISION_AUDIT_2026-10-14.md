# Minarva Biz — Evidence audit snapshot (2026-10-14)

Audited base main: `53287e9b5cb481dfae41af179e922ca43a851326`

## Audited facts, with reproducible locations

- Source scope: 329 unique product capability IDs in `docs/CAPABILITY_REGISTRY.md`, 111 unique AI capability IDs in `docs/AI_CAPABILITY_REGISTRY.md` = **440** items; `docs/PRODUCT_DELIVERY_BACKLOG.json` contains 23 separately tracked delivery outcomes (8 A / 6 B / 4 C / 2 D / 2 E / 1 F). IDs describe required scope, not implementation.
- Recursive Git tree: **946 committed files** at the audited SHA (including four additional measurement files relative to preceding snapshot), **43 web page routes**, **83 SQL migration filenames**, with **266 test/spec/smoke-named files** counted on the earlier predecessor snapshot. Neither file presence nor filename establishes passing behavior.
- Commercial Windows download exists: GitHub latest release v1.0.15 published 2026-10-02, with `MinarvaBiz-Setup-1.0.15.exe`, SHA256 companion, updater manifest. Publishing an installer is not proof it works on physical customer hardware.
- Concrete source example: `apps/web/src/app/(app)/sales/page.tsx` implements POS/normal/history tabs and calls shared billing store. Business-logic regression test `packages/business-logic/src/__tests__/commercial-purchase-sale-recovery.test.mjs` performs a multi-step purchase/sale/refund/recovery fixture. `docs/COMMERCIAL_JOURNEY_ACCEPTANCE.md` explicitly excludes physical printer, hosted tenant, restart and customer UAT.
- `docs/FINAL_RELEASE_AUDIT.md` explicitly notes that automated security/build controls are insufficient to prove real printer, native restart/restore, commercial license, hosted tenant UAT and release readiness.
- `docs/MASTER_VISION_EVIDENCE.json` is currently **empty**: `assessments: {}`. All **23 delivery outcomes** have **no recorded accepted status** and zero entries in `acceptanceEvidence`.

## Metrics and their honest meanings

| Metric | Verified value | Interpretation |
|---|---:|---|
| Scoped capabilities | 440 | Requirements enumerated, not built-feature count |
| Evidence point opportunities | 2,200 | Five gates per capability |
| Evidence recorded in new ledger | **0/2,200 = 0.00%** | Ledger completeness only, **not** project build completion |
| Explicitly accepted delivery outcomes | **0/23 = 0.00%** | Missing documented customer acceptance, **not** proof unimplemented |
| Actual full Master Vision completion | **UNKNOWN** | Cannot calculate from present evidence |
| Historical 51% | **REJECTED AS MEASURED FACT** | No item-weighted audited basis |

## Outstanding audit gates before a product-completion percentage

1. For every ID, inspect its production source path and relevant automated negative/positive test and attach immutable commit/path references.
2. Reproduce or locate test results and exact-head/postmerge CI showing those tests actually ran, not only that a workflow exists.
3. Verify production/staging or Windows release behavior for each applicable feature.
4. Obtain explicit customer UAT across applicable online/offline/hybrid editions, including permissions, tenant isolation, persistence and physical peripherals.
5. Independently review and commit each evidence gate into the ledger; regenerate `node scripts/master-vision-measurement.mjs` with the full 440 rows.

**No new completion percentage should be supplied until the above gates are verified.** This audit records hard facts and evidence gaps, not a fabricated credit allocation or source-only percentage.
