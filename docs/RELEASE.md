# Release readiness — Minarva Biz 1.0.4

## Verified main baseline

- Main commit audited: `4c8599db659dfa6798697ee530536072c23af8f9`
- Product version: `1.0.4`
- Windows installer: `MinarvaBiz-Setup-1.0.4.exe`
- Installer SHA-256: `40ae5ee6546e3c9d6ad5a419127fdf961fecbf86027bb482b720a60dfb2f297b`
- Final installer artifact: `minarvabiz-windows-installer-final` (artifact ID `10561709928`)

## Automated release gates — PASS

Latest verified runs on the audited main commit:

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
