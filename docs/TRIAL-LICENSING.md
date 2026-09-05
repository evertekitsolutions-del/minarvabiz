# Minarva Biz — 30-day first-install trial

## Product behavior

- A new Windows installation starts in an unactivated state.
- The first-run screen requires **email address, phone number, organization/business name, and address**.
- After successful registration, the installation receives a **30-day trial with all Minarva Biz features enabled**.
- Trial state is stored in Windows OS-backed Electron `safeStorage`, not in browser localStorage.
- The trial is machine-bound on Windows using a SHA-256 hash derived from the Windows `MachineGuid`; the raw `MachineGuid` is never sent to the server.
- The local state also records the last-seen time to detect obvious clock rollback.
- After expiry, the application does not open the normal POS screens; a commercial license is required.

## Online registration

The desktop app calls the deployed web API at `VITE_LICENSE_API_URL` when configured. The endpoint:

1. validates the submitted fields;
2. normalizes email and phone identity and checks email, phone, and device uniqueness;
3. stores the registration in Supabase `trial_registrations` using a server-only Supabase secret;
4. sends a notification to `minarvatechnologies@gmail.com` through Resend;
5. uses an idempotency key so retries do not intentionally duplicate the notification;
6. treats a database unique-constraint race as an already-registered trial rather than creating a second trial.

If the first activation happens while offline, the trial can still start locally. The registration remains marked unsynced and is retried on a later launch when the API is reachable.

## Machine binding

On Windows, the app reads the OS `MachineGuid` locally and derives a product-specific SHA-256 identifier. This identifier is what the trial registration stores as `device_id`. Because the source is an OS machine identifier rather than a randomly generated installation UUID, uninstalling and reinstalling Minarva Biz does not intentionally create a new trial identity on the same Windows installation.

The raw Windows `MachineGuid` is not stored in the trial record and is not included in the registration email. The server receives only the 64-character SHA-256 identifier.

For non-Windows development environments, the implementation falls back to the existing installation device ID and hashes that value for the trial identity.

## Required production configuration

Set these on the **web/server deployment**, never inside the desktop installer:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (preferred) or legacy `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `TRIAL_NOTIFICATION_FROM` — a sender address on a domain verified in Resend
- `VITE_LICENSE_API_URL` in the desktop build environment, pointing to the deployed Minarva Biz web/API origin

The destination `minarvatechnologies@gmail.com` is intentionally hard-coded as the business notification recipient. It is not exposed as a secret.

## Why this design

The desktop application must not contain Supabase secret keys, Resend API keys, SMTP passwords, or the Ed25519 private license key. Those secrets stay on the server. The desktop sends only the minimum registration data over HTTPS. Supabase RLS blocks public roles from reading/inserting trial records; the server endpoint uses the elevated secret key.

The commercial license system remains separate: Ed25519-signed commercial tokens are verified locally, while private signing material remains server-side.
