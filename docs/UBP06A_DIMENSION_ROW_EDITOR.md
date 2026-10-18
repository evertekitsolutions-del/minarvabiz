# UBP-06a — shared dimensional quantity editor

Baseline: main `833c7ed05a088ae35a18ae229591ce0d5aaf0e80`, after
UBP-01 (#478), schema/SQLite metadata (#479–480), tracked-inventory
preflight (#481), dimensional calculator (#482), booking preflight (#483).

This increment delivers an exported, controlled `DimensionRowEditor` for
future shared POS composition. It is not mounted in current customer billing.

- Reuse the existing integer picometre area calculator; no second conversion engine.
- Keep raw decimal fields as strings, separate input units and billable area unit.
- Require whole pieces (1–1000000), expose current quantity, remove quantity on invalid edits.
- Explicit apply emits a frozen measurement snapshot containing inputs,
  algorithm `area-v1`, pieces and exact milli-quantity for later audited line storage.
- Labeled native controls, unique IDs, keyboard operation, announced validation
  and disabled/read-only behavior. Apply is a button, never a nested submit form.

The parent must remount/reset on tenant, branch, line or product switch and
must obtain profile/role/license authority before mounting. Preview is not a
stock, price, tax, checkout, journal or persistence authority. UBP-05 line
measurement persistence, authenticated profile hydration, row composition,
atomic checkout, offline conflict reconciliation and real customer UAT remain.
No hosted migration, existing sale mutation, dependency, paid service or installer.

Validation commands:

- `node --experimental-strip-types --test packages/business-logic/src/__tests__/dimension-row-draft.test.mjs packages/business-logic/src/__tests__/dimensional-billing.test.mjs`
- `node --experimental-strip-types scripts/dimension-row-editor-smoke.mjs`
- `pnpm --filter @minarvabiz/ui typecheck`

The smoke test renders the actual TSX component using React server rendering;
it does not claim browser scanner/focus or complete POS acceptance.

Review and verification:
- Independent review: no Important/Critical findings within this bounded scope.
- 23 inventory/booking/dimension/draft behavior tests passed; 3 actual React
  rendering tests passed; UI and business-logic typechecks passed.
- Actions hardening and quality smoke passed. Root `pnpm test` is a placeholder
  script; the actual 224-file business-logic CI sweep passed locally (224/224).
- The runtime's default pnpm 11 initially rejected the pnpm 9 lockfile. The
  repository-pinned Corepack pnpm 9.15.0 resolved installation; no lockfile edits.
- Browser callback/focus and real POS/Windows integration are not verified by SSR.

## Continuation — installed startup and browser acceptance

PR #484 first Windows deep smoke failed at the initial Customers click with
zero visible controls after `TRIAL_READY`. The renderer-ready marker is set
before asynchronous SQLite/trial/license hydration has mounted AppShell.
The smoke now waits for the ready renderer, visible app content and usable
sidebar navigation. It does not click, alter trial/license state or suppress
startup/CDP failures while polling. A 30-second timeout preserves diagnostics.
Five regressions cover delayed workspace, stale renderer flag, fatal startup,
locked workspace timeout and CDP failure propagation.

`dimension-row-browser-smoke.mjs` renders the actual component in an isolated
fixture in the existing local CI Chrome session. It exercises Enter/Tab,
controlled keyboard edits, mixed units, exact immutable callback snapshots,
and invalid/disabled Apply refusal. CI execution is required before claiming
browser acceptance. The fixture does not invoke checkout or write customer data.
