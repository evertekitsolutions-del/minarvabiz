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

The desktop app calls the Cloudflare License Edge at `VITE_LICENSE_API_URL` when configured. The endpoint:

1. validates the submitted fields;
2. normalizes email and phone identity and checks email, phone, and device uniqueness;
3. calls a narrowly-scoped Supabase Postgres RPC using a Cloudflare-only RPC secret plus the Supabase publishable key;
4. stores the registration in `trial_registrations` while direct public table access remains blocked by RLS;
5. records the new row as `registered_email_pending` in the zero-cost phase instead of depending on Resend;
6. treats a database unique-constraint race as an already-registered trial rather than creating a second trial.

If the first activation happens while offline, the trial can still start locally. The registration remains marked unsynced and is retried on a later launch when the API is reachable.

## Machine binding

On Windows, the app reads the OS `MachineGuid` locally and derives a product-specific SHA-256 identifier. This identifier is what the trial registration stores as `device_id`. Because the source is an OS machine identifier rather than a randomly generated installation UUID, uninstalling and reinstalling Minarva Biz does not intentionally create a new trial identity on the same Windows installation.

The raw Windows `MachineGuid` is not stored in the trial record and is not included in the registration email. The server receives only the 64-character SHA-256 identifier.

For non-Windows development environments, the implementation falls back to the existing installation device ID and hashes that value for the trial identity.

## Required production configuration

Set these only on the Cloudflare License Edge / build environment, never inside the desktop installer:

- `SUPABASE_URL` — plain Worker configuration pointing at the Minarva Biz Supabase project;
- `SUPABASE_PUBLISHABLE_KEY` — encrypted Worker secret;
- `LICENSE_EDGE_RPC_SECRET` — encrypted Worker secret; only its SHA-256 hash is stored in the private database schema;
- `VITE_LICENSE_API_URL` in the desktop build environment, pointing to the Cloudflare License Edge.

No Resend API key, SMTP password, or Supabase service-role key is required for public trial registration.

## Why this design

The desktop application contains no Supabase secret/service-role key, email-provider credential, SMTP password, or Ed25519 private license key. The desktop sends only the minimum registration data over HTTPS. Supabase RLS blocks direct public access to trial records; the Cloudflare Worker calls only the scoped trial-registration RPC.

The commercial license system remains separate: Ed25519-signed commercial tokens are verified locally, while private signing material remains server-side.
