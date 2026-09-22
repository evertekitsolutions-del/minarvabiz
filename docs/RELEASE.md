# Release readiness — Minarva Biz 1.0.4

## Current main code baseline

- Main commit verified after PR #56: `e281c146c6eb27ff3a4828b95d793b1787db8b7b`
- Latest merged milestone: PR #56 — schema-safe Hybrid cloud pull cursors
- Product version remains: `1.0.4`
- Merged-main Vercel status: PASS

The PR #56 head commit `43d470c3c62b99521b50ba76310a30665525b22d` passed the full automated gate set before merge:

- CI: run `35688221560` — PASS
- Licensing Smoke: run `35688221567` — PASS
- Windows Feature Click Smoke: run `35688221574` — PASS
- Windows Deep Installed Smoke: run `35688221558` — PASS

These results validate the change set that was merged into the current main baseline. Physical customer-PC UAT remains a separate owner gate.

## Last packaged Windows delivery artifact

The last explicitly recorded final installer artifact predates the current main code baseline:

- Packaged-code baseline: `4c8599db659dfa6798697ee530536072c23af8f9`
- Windows installer: `MinarvaBiz-Setup-1.0.4.exe`
- Installer SHA-256: `40ae5ee6546e3c9d6ad5a419127fdf961fecbf86027bb482b720a60dfb2f297b`
- Final installer artifact: `minarvabiz-windows-installer-final` (artifact ID `10561709928`)

Do not represent that older installer binary as an exact build of current main. Repackage from current main before shipping the later merged accounting, service/laundry, and Hybrid-sync changes to a customer.

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
