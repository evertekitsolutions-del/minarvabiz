# Minarva Biz secure Windows updates

Minarva Biz updates are **optional**. The app never installs an update simply because a newer version exists.

## Trust model

A production update channel is enabled only when the desktop build receives both:

- `MINARVA_UPDATE_MANIFEST_URL` — HTTPS URL to a JSON manifest
- `MINARVA_UPDATE_PUBLIC_KEY_HEX` — 32-byte Ed25519 public key encoded as 64 hexadecimal characters

The private signing key must remain outside the client, repository and installer.

## Manifest

```json
{
  "product": "minarvabiz",
  "version": "1.0.5",
  "installerUrl": "https://updates.example.com/MinarvaBiz-Setup-1.0.5.exe",
  "sha256": "<64 lowercase hex characters>",
  "publishedAt": "2026-09-19T12:00:00.000Z",
  "notes": "Release notes",
  "signature": "<base64url Ed25519 signature>"
}
```

The signature is calculated over this exact UTF-8 payload:

```text
minarvabiz
<version>
<installerUrl>
<sha256 lowercase>
<publishedAt>
```

Release notes are intentionally not part of the security decision.

## Client validation

Before an update is offered:

1. Manifest URL must be HTTPS.
2. Manifest is capped at 64 KiB.
3. Product/version/hash/date fields are validated.
4. Ed25519 manifest signature is verified using the bundled public key.
5. The candidate semantic version must be newer than the installed version.

Before an installer is accepted:

1. Installer URL must be HTTPS (already covered by the signed manifest).
2. Download is capped at 500 MiB.
3. SHA-256 of the downloaded bytes must exactly match the signed manifest.
4. The verified installer is stored under the application's private update folder.

Before installation:

1. The app re-verifies the downloaded installer SHA-256.
2. A fresh SQLite backup is created.
3. The backup must pass SQLite structural validation.
4. If backup creation/validation fails, installation is blocked.
5. Only an explicit user action starts the installer.

Updates are never forced, and customer data is not deleted during upgrade.
