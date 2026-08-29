# Licensing security

## Keys
- Algorithm: Ed25519
- Client / desktop: **LICENSE_PUBLIC_KEY** only (env or build-time)
- License-admin server: **LICENSE_PRIVATE_KEY** in OS secret store / vault / env of the admin host
- **NEVER** commit private key to GitHub, client bundles, or Electron asar

## Generate
```bash
npx tsx packages/licensing/scripts/generate-keys.ts
# Store private key in: password manager + license-admin host only
```

## Validation
- Signature verification on activate
- Expiry + grace period offline
- Device fingerprint optional binding
- Suspend/revoke: admin registry; clients re-validate when online

## Production key location (your ops)
1. License-admin server environment variable `LICENSE_PRIVATE_KEY`
2. Or HSM / cloud KMS referenced by license-admin only
3. Public key in web `.env.local` and desktop packaging env
