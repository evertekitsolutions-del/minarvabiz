# Release readiness — Minarva Biz 1.0.4

## Current main code baseline

- Main commit: `1f511bc1971a39dfa106e094614cc2c95b8759f1`
- Latest merged milestone: PR #71 — reject non-finite WMS stock consumption quantities
- Product version remains: `1.0.4`
- Merged-main Vercel status: PASS

The **main-push** workflow set for `1f511bc1971a39dfa106e094614cc2c95b8759f1` passed:

- CI #837: run `35841909601` — PASS
- Licensing Smoke #304: run `35841909577` — PASS
- Windows Feature Click Smoke #229: run `35841909652` — PASS
- Windows Deep Installed Smoke #237: run `35841909653` — PASS

These runs validate the merged main commit itself, not only a pull-request head. Physical customer-PC UAT remains a separate owner gate.

## Current-main Windows installer artifact

Windows Deep Installed Smoke #237 packaged the current main commit and uploaded:

- Packaged-code baseline: `1f511bc1971a39dfa106e094614cc2c95b8759f1`
- Product version: `1.0.4`
- Final installer artifact: `minarvabiz-windows-installer-final`
- Artifact ID: `10741597173`
- GitHub artifact digest: `sha256:2f3276cd036a6f51a6f3276605fdaea17ab5071cb5bb232890e4adba8fdc3ff7`
- Artifact retention expiry: 2026-10-23

The digest above is GitHub's artifact-archive digest. It is not being represented as the inner `.exe` file hash. Before long-term customer delivery, preserve the chosen installer outside the temporary Actions retention window and record the executable SHA-256 separately if required.

## Automated release gates — PASS

The recorded final-installer baseline passed:

- CI: run `35380365555` — PASS
- Licensing Smoke: run `35380365569` — PASS
- Windows Feature Click Smoke: run `35380365428` — PASS
- Windows Deep Installed Smoke: run `35380365482` — PASS

The Windows deep smoke built the NSIS installer, verified the production public verification key was bundled without private-key material, installed the app on a clean Windows runner, launched the installed executable, activated the 30-day trial, exercised representative populated UI flows, and uploaded the final installer.

The feature-click smoke exercised the installed app through Chromium DevTools Protocol and verified the previously missing desktop modules/callbacks including Day-end Close, Payments, Returns, Suppliers, Staff Details, Audit Log, Customer Profile, Global Search/Command Palette, Notifications mark-all-read, and Reports refresh.

## Licensing deployment

The production license-admin service is hosted on Render. The desktop build fetches the production public key from the license-admin public-key endpoint and uses the Render HTTPS base URL for online activation/validation/deactivation.

Production private signing material remains server-side. The commercial build refuses a missing/invalid public key and refuses the repository fallback key.

## Supabase production state

The live Minarva Biz Supabase project is healthy and RLS security advisor currently reports no security findings. The database contains the licensing/trial schema and tenant-aware business schema.

A final tenant-policy alignment migration is kept in the repository so a fresh deployment reaches the same hardened RLS/default behavior as production.

## Remaining owner/UAT gates

Repository automation does **not** replace these physical/environment checks:

- Issue one real commercial test license and perform online activation on the target Windows PC.
- Test offline `.lic` activation, deactivation and PC replacement.
- Verify restart persistence and a manual backup/restore drill on the actual customer PC.
- Verify real printer/thermal-printer output where required.
- Online/hybrid production still needs an actual Supabase Auth user and tenant-isolation UAT with representative data.
- Windows code signing is not configured; unsigned builds can show Windows SmartScreen/Unknown Publisher warnings.

## Version policy

`1.0.4` remains the customer-delivery candidate because no public GitHub release has been published yet. If a customer receives a different binary after 1.0.4 is formally released, increment the product version before distributing it.
