# Licensing security

- Ed25519 signatures via `@noble/ed25519`
- Client holds **public key only**
- Private key: license-admin server / HSM only — never in Git or client bundles
- Generate: `npx tsx packages/licensing/scripts/generate-keys.ts`
- Offline validation: signature + expiry + grace days
- Device fingerprint binding supported in payload
- Clock skew: grace period absorbs moderate offline clock drift; online re-validation recommended
- Revocation: admin marks revoked; clients should re-check when online
