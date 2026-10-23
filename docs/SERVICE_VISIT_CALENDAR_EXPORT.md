# SVC-004 / SVC-013 — technician calendar export

Base: `6cc60ae522688ea45eca2fbc5e070b22a5fbdbec`.

The existing Service orders → Field service site visits → Technician route / stop order panel now offers a calendar download per technician/day. It re-reads `listServiceSiteVisits()` on click, enforcing current `reports.view` and active-branch scope before generating the file. Scheduled and arrived visits become private, transparent all-day events with stable per-branch visit UIDs and exclusive next-day end dates.

This is a local `.ics` snapshot. It does not send invitations, access calendar accounts, post records, or synchronize subsequent changes/cancellations. Import behavior and duplicate handling depend on the recipient calendar. Site addresses are included; photos, signatures, customer phone numbers and free-text visit notes are excluded. Existing Windows-only write restrictions and Online/Hybrid limitations remain unchanged.

## Reuse

Actual copied source: `adamgibbons/ics`, package 3.12.1, commit `be80affe735f1c97d2c5e2801a9a4f826ff4b631`, `src/utils/format-text.js`, ISC license. Inspected source/package/license at adoption; no upstream dependencies or binaries are added. Typed locally and extended to normalize lone CR. Full notice retained in vendor directory and THIRD_PARTY_NOTICES. UTF-8 byte folding and Minarva selection/serialization are original code. Updating upstream requires explicit source diff review; the formatter can be replaced without storage migration. No network runtime, recurring cost or provider lock-in.

## Verification

- Six new calendar behavior tests, plus 36 related route/SLA/parts/feedback/recovery tests: 42 passed, 0 failed.
- Standalone strict ES2022 TypeScript check and complete business-logic/UI package typechecks passed.
- Site-visit register + route + calendar regression: 56 tests passed.
- Full business-logic suite: initially 1,113 passed and 10 files failed because sql.js was not installed. After installing the locked database workspace dependencies, all 10 affected files were rerun: 47 tests passed, 0 failed. No code/test changes were needed for these environment failures. A subsequent fresh full run completed with **1,160 tests passed, 0 failed, 0 skipped** (`node --test --test-concurrency=4 packages/business-logic/src/__tests__/*.test.mjs`). Both package typechecks and the product delivery scope audit also passed again.
- Independent code reviewer approved after reading code/tests/UI scope handling and rerunning the six new tests.
- Web/Desktop builds, GitHub exact-head CI, Outlook/Google import UAT and installed Windows UAT remain pending. GitHub push was blocked by automatic approval review, so there is no new PR/merge or CI result.
- Initially environment-blocked files (all retested successfully): commerce-kit-sqlite-pilot, desktop-native-sqlite-atomic-write, desktop-native-sqlite-fingerprint-fence, desktop-restore-staging, holiday-signed-receipt-staging, hr-roster-sqlite-conflict-recovery, lot-quarantine-qc-sqlite-pilot, lot-reservation-sqlite-pilot, lot-return-sqlite-pilot, lot-stock-sqlite-pilot (`packages/business-logic/src/__tests__/*.test.mjs`).
- No production schema, deployment, release or global completion percentage change.

Rollback: revert the feature PR; no data migration needed.
