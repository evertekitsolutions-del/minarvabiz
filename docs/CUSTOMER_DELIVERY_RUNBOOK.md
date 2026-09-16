# Minarva Biz — Customer Delivery Runbook

Product version: **1.0.4**

## 1. Build a customer installer

From repository root:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @minarvabiz/desktop run package:win
```

The installer is produced as `apps/desktop/release/MinarvaBiz-Setup-1.0.4.exe`.

For a clean Windows build machine, `BUILD-WINDOWS.cmd` runs `build-windows.ps1` and installs the required Electron/Vite packaging tools.

## 2. Configure the commercial signing key

Generate a new Ed25519 keypair on a secure owner/admin machine:

```bash
pnpm --filter @minarvabiz/licensing generate-keys
```

Keep the private key secret. Before producing the customer installer, set only the public key in the build environment:

```text
MINARVA_LICENSE_PUBLIC_KEY_HEX=YOUR_64_HEX_PUBLIC_KEY
```

The private signing key is never required by the desktop build.

For the license-admin server, configure these server-only values in the hosting provider's secret store:

```text
LICENSE_PRIVATE_KEY=YOUR_64_HEX_PRIVATE_KEY
LICENSE_API_SECRET=YOUR_LONG_RANDOM_ADMIN_SECRET
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SUPABASE_SECRET
```

Do not use `NEXT_PUBLIC_` for any secret value.

## 3. Issue the first signed customer license

The secure owner/admin command is:

```bash
LICENSE_PRIVATE_KEY=YOUR_64_HEX_PRIVATE_KEY pnpm --filter @minarvabiz/licensing issue-license -- --customer="Customer Name" --plan=professional --edition=offline --expires=2027-09-16
```

The command prints a signed Minarva Biz license token and license ID.

For an online/hybrid installation, use the deployed `license-admin` panel to create the license so the license is recorded in Supabase and activation can be controlled centrally.

## 4. Offline customer activation

When the customer PC has no internet access:

1. Install Minarva Biz.
2. Open the desktop license/support screen and obtain the 64-character device fingerprint.
3. In `license-admin`, create/open the customer's license and create an offline activation package for that exact device fingerprint.
4. Transfer the generated `.lic` file to the customer PC.
5. Import the `.lic` package in Minarva Biz.
6. The application verifies the signed token + signed activation certificate locally and stores the activation in OS-protected storage.

## 5. Online customer activation

When the customer has internet access:

1. Set the desktop's license API URL to the deployed license API.
2. Customer pastes the signed license token into Minarva Biz.
3. Desktop verifies the token signature and sends token + device fingerprint to the license API.
4. The server enforces license status and activation limits and returns a signed activation certificate.
5. Desktop stores the token, device binding and certificate securely.
6. Later launches can validate locally and use the configured plan-specific offline grace policy when the API is unavailable.

## 6. Customer first-run checklist

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
- Backup creates a valid SQLite database backup.
- Restore returns a usable database.
- Close/reopen retains data in `%APPDATA%\Minarva Biz\minarvabiz.db`.
- Uninstall does not remove application data.
- Real printer output is checked on the customer's hardware when required.

## 7. Windows data and support

Primary offline business database:

```text
%APPDATA%\Minarva Biz\minarvabiz.db
```

License state is kept separately in OS-protected storage under the Electron user-data directory. Legacy JSON database persistence is disabled from the production TypeScript path.

## 8. Supabase migration order

Apply every file in `supabase/migrations` in this repository order before enabling online/hybrid production. The current lifecycle additions are ordered after the initial schema/RLS foundation and include license lifecycle, trial registration, atomic license activation, production hardening, and the latest phase-column alignment migration.

For a live production project, use the Supabase CLI migration workflow or run the SQL files in strictly increasing repository migration order. Do not skip a migration because a later table or function appears to already exist.

Supabase client configuration uses the public client key only. Elevated secret/service-role credentials stay on the server. Current Supabase documentation recommends publishable/secret keys for new deployments, while legacy anon/service-role keys remain compatible during migration. 

## 9. Release rule

Repository CI proves code/build/package gates. Customer delivery is complete only after the owner performs the real Windows UAT checklist and installs the production public key before generating the final customer installer.
