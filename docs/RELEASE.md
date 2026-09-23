# Release readiness — Minarva Biz 1.0.4

## Final release freeze

- Frozen runtime/code baseline: `1de0f3b198ff369efc06c530efc5afa8eef81835`
- Latest merged runtime milestone: PR #81 — Post product opening stock through accounting
- Product version: `1.0.4`
- GitHub-reported Vercel commit status on the frozen baseline: **PASS**
- Feature hunting is closed for this release candidate. Further code changes require a reproducible release blocker found by testing.
- PRs #15, #17 and #22 are stale/superseded and must not be merged.

The release-freeze documentation may advance `main` after the code baseline above, but it must not change runtime behavior. The code baseline named above remains the frozen customer-delivery candidate unless UAT finds a blocker.

## Frozen-main automated evidence — PASS

The **main-push** workflows for `1de0f3b198ff369efc06c530efc5afa8eef81835` all completed successfully:

- CI #864: run `35886528870` — PASS
- Licensing Smoke #331: run `35886528896` — PASS
- Windows Feature Click Smoke #256: run `35886528903` — PASS
- Windows Deep Installed Smoke #264: run `35886528950` — PASS

These runs validate the merged main code baseline itself, not only the PR head.

## Final Windows installer evidence

Windows Deep Installed Smoke #264 packaged the frozen main baseline and uploaded the final installer artifact:

- Packaged-code baseline: `1de0f3b198ff369efc06c530efc5afa8eef81835`
- Product version: `1.0.4`
- Artifact: `minarvabiz-windows-installer-final`
- Artifact ID: `10763560386`
- Artifact size: `100429256` bytes
- GitHub artifact digest: `sha256:7d6c574c7da064ab0fcc3d4b78602527b77329224b8415dda01618fcc37e8654`
- Artifact created: 2026-09-23 16:11:48 UTC
- Artifact retention expiry: 2026-10-23 16:11:44 UTC

The digest above is GitHub's artifact-archive digest, not an independently recorded inner installer `.exe` SHA-256. Preserve the chosen customer-delivery installer outside the temporary Actions retention window and record the executable SHA-256 at delivery time if required.

## What the automated gates cover

Windows Deep Installed Smoke #264 built the NSIS installer, installed the application, launched the installed executable, exercised installed UI/licensing paths and uploaded the final installer artifact.

Windows Feature Click Smoke #256 exercised the installed desktop application through the feature-level click workflow.

CI #864 and Licensing Smoke #331 validate the repository build/test path and commercial licensing path for the frozen baseline.

## Accounting completion included in the freeze

PR #81 completed the last known planned code milestone before freeze:

- Non-zero product opening stock is posted through accounting at product creation.
- Positive opening value posts Inventory Asset debit / Opening Balance Equity credit.
- Invalid or out-of-range opening stock/cost values are rejected.
- Permission and posting-account preflight occurs before durable product mutation.
- Failed positive-value posting rolls back the product mutation.
- Zero stock and zero-value opening stock do not create an accounting journal.

No additional code milestone is planned unless testing finds a real blocker.

## Licensing deployment

The production license-admin service remains the server-side signing/activation boundary. Desktop builds contain only public verification material; private signing material is not bundled into the client.

Commercial activation/validation/deactivation, offline license handling and licensing smoke coverage are part of the existing release path.

## Supabase / online-hybrid state

Repository migrations contain the tenant-aware business schema, licensing/trial schema, accounting additions and later operational/WMS migrations accumulated through the current development cycle.

Production-environment correctness still requires real Auth/tenant UAT with representative data. Automated source/build evidence does not replace that external validation.

## Remaining owner / physical UAT gates

The following are intentionally **not** additional feature-development milestones:

- Install the frozen 1.0.4 installer on the intended Windows/customer test PC.
- Issue one real commercial test license and verify online activation.
- Verify offline `.lic` activation, restart/grace behavior, deactivation and PC replacement.
- Perform a restart-persistence test and manual backup/restore drill.
- Verify real printer/thermal-printer output where required.
- For online/hybrid use, test Supabase Auth and tenant isolation with representative data.
- Record any genuine regression with reproducible evidence; only such a blocker reopens code work.
- Windows code signing remains a delivery/operations consideration; unsigned builds can show SmartScreen/Unknown Publisher warnings.

## Vercel verification note

GitHub reports the Vercel commit status for the frozen baseline as `success` with deployment target `4rX4gtVENVj9yCun5J4kQrywAZtF`.

Direct Vercel connected-app inspection was unavailable at the freeze checkpoint because the connected team scope required re-authentication. This does not change the GitHub-reported successful deployment status; it only limits direct Vercel-account inspection from this checkpoint.

## Version policy

`1.0.4` remains the customer-delivery candidate. Do not add features after this freeze under the same candidate baseline. If a blocker requires a runtime change after customer/public release, increment the product version as appropriate before distributing the changed binary.
