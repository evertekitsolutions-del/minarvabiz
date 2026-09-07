# Minarva Biz production license setup

This is the production configuration path for the commercial Ed25519 licensing system.

## 1. Generate one production keypair

Run:

```bash
node scripts/generate-license-keypair.mjs
```

This prints two values:

- `MINARVA_LICENSE_PUBLIC_KEY_HEX` — 64 hexadecimal characters, safe to ship in the desktop verifier.
- `LICENSE_PRIVATE_KEY` — 64 hexadecimal characters, secret and server-side only.

Generate this once for the production license authority. Do not generate a new pair during every build.

## 2. Configure the license-admin production server

Set these server-side environment variables:

```text
LICENSE_API_SECRET=<strong random admin/API secret>
LICENSE_PRIVATE_KEY=<64 hex Ed25519 private key>
SUPABASE_URL=<production Supabase project URL>
SUPABASE_SECRET_KEY=<production server-side Supabase secret key>
```

`LICENSE_PRIVATE_KEY`, `SUPABASE_SECRET_KEY`, and `LICENSE_API_SECRET` must never be exposed to the browser or desktop client.

## 3. Configure the desktop build environment

Set:

```text
MINARVA_LICENSE_PUBLIC_KEY_HEX=<matching 64 hex public key>
VITE_LICENSE_API_URL=<production license API base URL>
```

The desktop build script writes the public key into a generated `apps/desktop/electron/license-config.ts`. A private key is never written into that file.

## 4. Issue a production license

Use the license-admin application after its production server environment is configured. The admin server signs the license token and stores its SHA-256 hash plus license metadata in Supabase.

The desktop client verifies the signed token locally. Online activation also receives a separately signed device activation certificate. Offline activation packages contain both the signed license token and the signed device certificate.

## 5. Offline activation

For a Windows device that cannot contact the license API:

1. Obtain the device ID from the installed Minarva Biz client.
2. In license-admin, select the license and create an offline activation package for that 64-character device ID.
3. Transfer the generated `.lic` package to the Windows machine.
4. Import the package in Minarva Biz.

The desktop verifies the license token and activation certificate locally and stores the result in OS-protected storage.

## 6. Release gates

A production release is considered ready only when all of the following are true:

- CI desktop, web, and Windows packaging jobs pass.
- The Windows installed-runtime smoke test passes and creates `%APPDATA%\Minarva Biz\minarvabiz.db`.
- The production desktop build contains the matching public key.
- `LICENSE_PRIVATE_KEY` exists only in the license-admin server secret store.
- Online activation/validation works against the production API.
- Offline `.lic` import works on a real Windows device and enforces device binding.
- Deactivation/revocation prevents continued use after the locally stored grace window rules are applied.

The repository CI cannot replace the final hands-on acceptance test on a real Windows workstation.
