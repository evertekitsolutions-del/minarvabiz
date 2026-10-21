# Next.js 16 / OpenNext Security Compatibility Update

**21 October 2026 — issue #565**

## Included

- Upgrade customer-facing `apps/web` to the verified released **Next.js 16.4.1**, with unchanged React and Cloudflare adapter `@opennextjs/cloudflare@1.20.12`.
- Regenerate `pnpm-lock.yaml` using repository-pinned **pnpm 9.15.0** on an isolated GitHub Actions runner. The temporary generator workflow was **removed from the branch** after capturing the lockfile; it will not be installed by the merged PR.
- Fail closed in `scripts/frontend-cloudflare-preview-deploy.mjs` for unsupported Next.js 15, even if its security patch number exceeds the previously accepted floor. Require supported 16.4.1+ for this release's adapter.
- Strengthen `scripts/cloudflare-preview-auth-guard.test.mjs` to test that Next 15.5.28 is **rejected**; keep demo mode and no-auth deployment rejection unchanged.

## Compatibility gates

**Must verify before merge:** frozen-lockfile installation, Next16 TypeScript and production build, OpenNext Worker build, middleware/auth/CSP behavior, desktop/Windows smoke, Playwright web UI, SBOM and security checks. Do not claim green while any required gate is pending/failed. If Next16 breaks the app, patch only the narrow compatibility issue, preserving provider-neutral hosting.

**Not included:** Next.js license-admin migration (separate assessment), live Cloudflare Worker deployment, changing production DNS, customer data, financial write paths, active kit reservations, Windows installer publishing, new paid hosting or CI bypass flags.

References: issue #565, main project tracker #325, kit SQLite pilot PR #564. Never set `--dangerouslyUseUnsupportedNextVersion`.
