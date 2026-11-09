# Bigcapital accounting integration — review workflow

## Implemented journey

The existing shared Accounting → Journal Entries screen now contains an opt-in **Enable Bigcapital journal review** panel (off on each mount/branch change). This is wired into the existing AccountingPanel used by Minarva clients, not another standalone HTML app.

1. Obtain a credential-free catalog with the read-only Node command below.
2. Load its JSON in the panel. Check displayed Bigcapital origin and organization.
3. Enter a stable source workspace ID, target branch ID and date range. Match source accounts to target accounts explicitly; names/codes are not assumed unique.
4. Download a deterministic journal review JSON containing draft API payloads. Nothing is posted. This file is **not** a native Bigcapital UI import format.

The builder uses the existing JournalEntry records, includes both posted and void originals plus dated reversals, and follows the existing report convention that a legacy null branch belongs to headquarters. Source header totals, line totals, identity, branch, target account activity/currency and target base currency must reconcile. A different target base currency is blocked (exchange_rate = 1 is never used for cross-currency conversion). Current source accounting precision is two decimals; this initial adapter explicitly limits currencies to INR/AED/USD/EUR/GBP. OMR and other precision need a separate verified accounting migration.

The UI checks accounting.view at file-read and export boundaries. This is a local review/export permission, not authority to post remotely. It imports the existing shared package, uses the current branch and shop currency, resets mappings when branch changes, and persists no credentials or mappings. Actual currency/tax/account reconciliation remains an accountant review.

## Read-only connection

Node 24 (or a compatible Node TypeScript-stripping runtime) is required for the command. Configure these values in the execution environment / secret manager; do not put the API key in a browser, URL, argument, git file or chat:

- `BIGCAPITAL_ORIGIN`: exact HTTPS origin of the selected test instance, without `/api` or trailing slash.
- `BIGCAPITAL_ORGANIZATION_ID`: expected organization ID, verified by the operator.
- `BIGCAPITAL_API_KEY`: that instance's `bc_...` API key.

```sh
node --experimental-strip-types scripts/bigcapital-readonly.mjs catalog /secure/path/bigcapital-accounts.json
```

Only GET requests are implemented:

- `/api/organization/current` — check returned organization_id matches expected organization. An API-key tenant cannot be selected merely by changing the organization-id header.
- `/api/accounts?structure=flat` — get account IDs, names, codes, active state and currencies.
- `/api/branches` — verify target branch exists.

Redirects fail; requests have 15-second timeout and 2 MB response limit. Errors omit response bodies and credentials. Output strips unrelated metadata and is created exclusively with mode 0600; an existing file is never overwritten. The account catalog is editable input, **not a signed authorization proof**. A future writer must re-resolve live server authority and current account/branch state.

No provider URL is hardcoded. No Bigcapital account was created, no service was deployed, no hosted connection was exercised, and no customer data was used for tests. Test-server origin/organization/key are still needed for actual authentication and API acceptance. No production database or old HTML global state is touched.

## Compatibility evidence / license boundary

Reviewed upstream: `bigcapitalhq/bigcapital` develop at `efa69475715c37c54acf85ad3de526395f1d37a5` (9 Nov 2026 IST).

API contract inspected directly at that commit:

- `packages/server/src/main.ts` — /api prefix.
- `modules/Auth/api-key/AuthApiKey.strategy.ts`, `common/decorators/ApiCommonHeaders.ts` — Bearer API key and organization header.
- `modules/Organization/Organization.controller.ts`, current-organization response DTO — organization_id and metadata.base_currency after serialization.
- `modules/Accounts/Accounts.controller.ts`, GetAccounts.service.ts, AccountResponse.dto.ts — `{ accounts, filter_meta }`, flat structure and account fields.
- `modules/Branches/Branches.controller.ts`, queries/GetBranches.service.ts — branch array.
- `modules/ManualJournals/dtos/ManualJournal.dto.ts` — manual journal request fields, entries and publish flag.
- `common/interceptors/serialize.interceptor.ts` — snake_case wire representation.

Upstream source: https://github.com/bigcapitalhq/bigcapital/tree/efa69475715c37c54acf85ad3de526395f1d37a5

Original Minarva adapter implementation; no Bigcapital application code, SDK, assets, database implementation or dependencies are copied into this repository. Bigcapital remains a separately operated AGPL-3.0 application. This implementation does not decide the licensing of a future combined/bundled distribution. Any Bigcapital modifications, redistribution, source obligations or proprietary licensing exception must be reviewed before rollout. A commercial license has not been assumed available.

## Validation

```sh
node --experimental-strip-types --test packages/business-logic/src/__tests__/bigcapital-journal-preview.test.mjs scripts/bigcapital-readonly.test.mjs
node node_modules/typescript/bin/tsc --noEmit -p packages/business-logic/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p packages/ui/tsconfig.json
```

For the React DOM flow, install jsdom@26.1.0 into an isolated test directory and set POS_TEST_MODULES to its node_modules directory:

```sh
POS_TEST_MODULES=/tmp/minarva-pos-test/node_modules node --experimental-strip-types --test scripts/bigcapital-preview-ui.test.mjs
```

Tests use synthetic journals and mocked API responses. They exercise mapping, branch filters, void/reversal history, exact money, default-off behavior, permission loss, branch change, JSON download, organization mismatch, response bounds and credential redaction. Local browser rendering/physical Windows acceptance is not inferred from jsdom. Existing accounting report regression is also run.

## Remaining full accounting-backend integration

This is a complete **prepare/review workflow**, not a completed Bigcapital backend replacement:

- Live test-instance acceptance against the deployed API version and deployment-specific licensing decision.
- Durable tenant/company/branch/remote identity mapping and authorized admin configuration.
- Atomic outbox, remote acknowledgement IDs, reconciliation and recovery of ambiguous network outcomes. Stable source references in this export are NOT remote exactly-once guarantees.
- Audited posting/reversal writer with fresh permissions, account/branch/currency checks and explicit authorization before financial writes.
- Opening balances/cutover, customer/supplier/contact mappings, payment/tax workflows, report comparison, and Offline/Online/Hybrid acceptance.
- No synthetic completeness percentage increase and no promise that Bigcapital implements boutique/laundry/thermal/barcode workflows.

Rollback: revert this PR. It adds a disabled preview panel, pure builder and read-only command, with no database changes or automatic financial writes.
