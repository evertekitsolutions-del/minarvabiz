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

## 2. Production signing key

The current production signing key is managed by the Render license-admin service. The private seed remains server-side. Commercial Windows CI fetches the matching **public** verification key from the deployed license-admin public-key endpoint before building the installer.

Do not generate a replacement keypair for routine customer delivery. Replacing the production signing key would require rebuilding every desktop installer with the new public key.

If key rotation is intentionally required, use the repository key-generation script on a secure owner/admin machine, place only the private key in the license-admin secret store, verify the public-key endpoint, and rebuild the Windows installer. Never commit or share the private key.

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

## 9. Supabase migrations

For a **fresh** Supabase environment, apply every SQL file under `supabase/migrations/` in filename order, including the current tenant-policy alignment migration.

For the existing production Minarva Biz Supabase project, migrations are already applied and tracked. **Do not manually replay the migration files against production.** Add new changes as a new migration and apply that migration through the normal Supabase migration workflow.

The current repository includes tenant bootstrap/default handling and a final RLS policy alignment so authenticated inserts receive the user's organization and tenant policies do not depend on browser access to privileged helper functions.

Supabase browser configuration uses only the public client key. Elevated secret/service-role credentials remain server-side.

## 10. Release rule

Repository CI proves code/build/package gates. The production license-admin, signing key and Supabase database are already configured. Customer delivery is complete only after one real commercial license is issued/activated on the intended Windows PC and the physical UAT checklist (restart persistence, backup/restore, deactivation/replacement and required printer output) is completed.
