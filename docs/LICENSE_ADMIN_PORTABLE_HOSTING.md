# License Admin portable hosting

The License Admin is a browser-only static application. Privileged operations go directly from the authenticated browser to the license edge/PostgreSQL authority. No hosting provider receives service-role, signing, emergency, or admin-session secrets.

## Portable artifact

Run `pnpm --filter @minarvabiz/license-admin build`. Deploy `apps/license-admin/out/` on any HTTPS static host, Minarva-owned web server, or compatible edge/static provider. The host must apply the security headers in `apps/license-admin/public/_headers` (or equivalent), serve the root index, and never inject privileged secrets.

## Safe origin cutover

1. Deploy the exact merged-main static artifact to the replacement HTTPS host.
2. Add its origin to `LICENSE_ADMIN_ALLOWED_ORIGINS` while retaining the current production origin.
3. Verify named login, TOTP AAL2, dashboard and admin business operations, plus emergency control authorization.
4. Establish and securely retain the one-time emergency credential without copying it into logs, GitHub, chat, or hosting configuration.
5. Prove emergency login, /api/admin/me, business operations, logout, revocation, previous-credential grace, origin rejection, and rate/backoff.
6. Remove the old origin only after parity proof.

Cloudflare may host a deployment, but this artifact/security contract must remain provider-neutral and self-hostable.
