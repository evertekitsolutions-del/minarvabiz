# Minarva Biz — Customer Delivery Runbook

Product version: **1.0.4**

## 1. Build a customer installer

From repository root:

```powershell
pnpm install --frozen-lockfile
$env:MINARVA_LICENSE_PUBLIC_KEY_HEX="YOUR_64_HEX_PUBLIC_KEY"
$env:MINARVA_COMMERCIAL_RELEASE="1"
powershell -ExecutionPolicy Bypass -File .\build-windows.ps1
```

The installer is produced as `apps/desktop/release/MinarvaBiz-Setup-1.0.4.exe` for this release. The build helper discovers the current `MinarvaBiz-Setup-*.exe`, so it does not depend on a stale hard-coded version.

For a clean Windows build machine, `BUILD-WINDOWS.cmd` runs the Windows build helper and installs the required Electron/Vite packaging tools.

## 2. Configure the commercial signing key

Generate a new Ed25519 keypair on a secure owner/admin machine:

```powershell
pnpm --filter @minarvabiz/licensing generate-keys
```

The command prints a **private key** and **public key**. Store the private key in a secure password manager/secret store. Never commit it to Git and never put it in a `NEXT_PUBLIC_*` variable.

Before producing the customer installer, set only the public key in the build environment:

```powershell
$env:MINARVA_LICENSE_PUBLIC_KEY_HEX="YOUR_64_HEX_PUBLIC_KEY"
$env:MINARVA_COMMERCIAL_RELEASE="1"
```

The commercial release build refuses to use the repository fallback verification key when `MINARVA_COMMERCIAL_RELEASE=1`.

## 3. Configure license-admin server secrets

Keep these values only in the license-admin hosting provider's server-side secret store:

```text
LICENSE_PRIVATE_KEY=YOUR_64_HEX_PRIVATE_KEY
LICENSE_API_SECRET=YOUR_LONG_RANDOM_ADMIN_SECRET
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SUPABASE_SECRET
```

The desktop and browser clients must never receive the private signing key or Supabase secret/service-role credential. Public browser configuration may use the public Supabase client key.

## 4. Issue the first signed customer license

For a centrally managed customer, use the deployed **license-admin** panel so the license is recorded in Supabase and activation/deactivation can be controlled centrally.

For secure owner-side CLI issuance:

**PowerShell:**

```powershell
$env:LICENSE_PRIVATE_KEY="YOUR_64_HEX_PRIVATE_KEY"
pnpm --filter @minarvabiz/licensing issue-license -- --customer="Customer Name" --plan=professional --edition=offline --expires=2027-09-16
Remove-Item Env:LICENSE_PRIVATE_KEY
```

**Bash:**

```bash
LICENSE_PRIVATE_KEY=YOUR_64_HEX_PRIVATE_KEY pnpm --filter @minarvabiz/licensing issue-license -- --customer="Customer Name" --plan=professional --edition=offline --expires=2027-09-16
```

The command prints the signed Minarva Biz license token and license ID. The private key is read only from the process environment and is not written to the repository.

For a machine-bound license issued directly by the CLI, add `--device=64_HEX_DEVICE_FINGERPRINT`.

## 5. Offline customer activation

When the customer PC has no internet access:

1. Install Minarva Biz.
2. Open the desktop license/support screen and obtain the 64-character device fingerprint.
3. In `license-admin`, create/open the customer's license and create an offline activation package for that exact device fingerprint.
4. Transfer the generated `.lic` file to the customer PC.
5. Import the `.lic` package in Minarva Biz.
6. The application verifies the signed token and signed activation certificate locally and stores the activation in OS-protected storage.
7. Test a restart while offline and confirm the configured plan grace behavior.

## 6. Online customer activation

When the customer has internet access:

1. Deploy the license API/license-admin with its server-only secrets.
2. Configure the desktop's license API URL to the deployed license API.
3. Customer pastes the signed license token into Minarva Biz.
4. Desktop verifies the token signature and sends token + device fingerprint to the license API.
5. The server enforces license status and activation limits and returns a signed activation certificate.
6. Desktop stores the token, device binding and certificate securely.
7. Later launches can validate locally and use the configured plan-specific offline grace policy when the API is unavailable.
8. Test deactivation and PC replacement before delivering the product.

## 7. Customer first-run / UAT checklist

- Installer launches without a database or WASM error.
- Dashboard retains the approved dark-navy sidebar and colorful KPI/chart layout.
- First-run trial/registration works on a new installation.
- Customer license gate appears when the trial is not active.
- Valid customer license activates.
- Wrong-machine token is rejected.
- Invalid/tampered token is rejected.
- Expired license reports expiry/grace state clearly.
- Customer, product, sale, payment and stock flow works.
- Tailoring order + measurement + order expense/profit works.
- Laundry and general expense flows work.
- Purchases/suppliers and purchase payment method work.
- Production workflow and material-roll/consumption flows work where enabled.
- Backup creates a valid SQLite database backup.
- Restore returns a usable database.
- Close/reopen retains data in `%APPDATA%\Minarva Biz\minarvabiz.db`.
- Uninstall does not remove application data.
- Online/hybrid sync is tested with representative data.
- Financial conflicts do not silently overwrite one side; manual resolution is used.
- Real printer output is checked on the customer's hardware when required.

## 8. Windows data and support

Primary offline business database:

```text
%APPDATA%\Minarva Biz\minarvabiz.db
```

License state is kept separately in OS-protected storage under the Electron user-data directory. Legacy JSON database persistence is disabled from the production TypeScript path.

## 9. Supabase migration order — ALL files

Apply **all 15 repository migrations in exactly this order** before enabling online/hybrid production:

1. `001_core_schema.sql`
2. `002_rls_policies.sql`
3. `003_tenant_rls.sql`
4. `004_quotations_and_extensions.sql`
5. `005_product_variants.sql`
6. `006_integrity_indexes.sql`
7. `007_trial_registrations.sql`
8. `20260901_license_lifecycle.sql`
9. `20260901_trial_registrations.sql`
10. `20260911_license_activation_atomicity.sql`
11. `20260911_production_hardening.sql`
12. `20260915_align_phase4_phase5_columns.sql`
13. `20260915_operations_completion.sql`
14. `20260915_operations_tenant_hardening.sql`
15. `20260915_purchase_payment_method.sql`

Do not skip a migration because a later table or function appears to already exist. Use the Supabase CLI migration workflow where possible so migration history is tracked consistently.

The `20260915_operations_completion.sql` migration creates the operations/material persistence tables; the immediately following `20260915_operations_tenant_hardening.sql` migration applies organization-aware RLS to those tables. Both are required.

Supabase client configuration uses the public client key only. Elevated secret/service-role credentials stay on the server.

## 10. Release rule

Repository CI proves code/build/package gates. Customer delivery is complete only after the owner performs the real Windows UAT checklist, applies the live Supabase migrations, deploys license-admin, generates the production keypair, and produces the final installer with the matching public verification key.
