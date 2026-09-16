# Release readiness — Minarva Biz 1.0.4

## Automated release gates

1. `pnpm install --frozen-lockfile --ignore-scripts`
2. `pnpm --filter @minarvabiz/web exec tsc --noEmit`
3. `pnpm --filter @minarvabiz/web build`
4. `node scripts/smoke.mjs`
5. `node scripts/quality-smoke.mjs`
6. `pnpm --filter @minarvabiz/database typecheck`
7. `pnpm --filter @minarvabiz/business-logic typecheck`
8. `pnpm --filter @minarvabiz/ui typecheck`
9. `pnpm --filter @minarvabiz/desktop typecheck`
10. `pnpm --filter @minarvabiz/desktop build:renderer`
11. `pnpm --filter @minarvabiz/desktop build:electron`
12. `pnpm --filter @minarvabiz/desktop run package:win`

CI run #514 on the `e7b6824b075c8cf9081d34df953a4205f86baca1` production baseline passed the web, license-admin, desktop and Windows-package jobs. The Windows package gate built `MinarvaBiz-Setup-1.0.4.exe`, installed it, verified a valid SQLite database, preload bridge readiness and renderer mount, and uploaded the installer artifact.

## Current release artifact

`MinarvaBiz-Setup-1.0.4.exe`

CI artifact: `minarvabiz-windows-installer`  
Artifact ID: `10431675300`  
SHA-256: `0cea4b9409a70735389722de9662062ecda9b3664df33f539e8d0a59645a1a64`  
Artifact expiry: 2026-09-30

## License-key setup

Generate an Ed25519 keypair outside the source repository. The private key must remain only in the license-admin/server secret store. The public verification key may be bundled into the desktop build.

## Supabase setup

Apply the repository migrations to the live Minarva Biz Supabase project in filename order, then configure the production environment variables from `.env.example`. Live RLS/tenant behavior and end-to-end hybrid sync require owner credentials and are not considered verified by repository CI alone.

## Physical Windows UAT gate

Before release, the owner must install the installer on the target Windows PC and validate the complete acceptance checklist: visual dashboard theme, first-run trial/license, customer/product/sale/payment flow, stock deduction, tailoring/measurement/order expense/profit, laundry, backup/restore, close/reopen persistence, uninstall AppData preservation and real printer output.

## Version policy

`1.0.4` is the current commercial release version for the product-facing root/apps. Internal workspace libraries may retain independent implementation versions because they are not distributed as separate commercial artifacts.
