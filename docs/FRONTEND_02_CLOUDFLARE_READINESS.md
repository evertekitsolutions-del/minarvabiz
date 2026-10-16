# FRONTEND-02B — Cloudflare hosting readiness and deployment gates

Status: **audit / pre-deployment; public Cloudflare storefront NOT yet deployed**.

## 2026-10-16 — Customer hosting cutover safety

- **Vercel auto-deploy for every Git branch is disabled** in both repository-level `vercel.json` and `apps/web/vercel.json` via `git.deploymentEnabled: false`; legacy GitHub integration is also disabled. This is covered by a required CI contract test.
- The **last working Vercel production deployment is intentionally retained temporarily for rollback and existing customer access**. This is **not** an assertion that Cloudflare customer hosting works yet.
- Existing Cloudflare Pages project `minarvabiz-license-admin` and Workers `minarva-biz-free-ai`, `minarva-biz-license-edge` **are not** a verified hosted customer web application. Do not redirect or delete customer access until a real Cloudflare Worker deployment is tested end-to-end.
- `apps/web/wrangler.jsonc` is *preview configuration only*. `scripts/frontend-cloudflare-preview-deploy.mjs` fails closed until the locked Next.js version is patched to the supported adapter baseline and pinned OpenNext/Wrangler dependencies are in the lockfile.
- Before permanent Vercel removal, replace or verify remaining operational URLs including `VITE_SUPPORT_API_URL` in `.github/workflows/release-windows.yml`; verify customer auth, tenant isolation, support requests, CSP/middleware, email recovery, Windows/Hybrid behavior, and rollback.
- No recurring paid infrastructure or AI service is authorized by this change.

## Verified repository and platform facts (2026-10-14)

- Existing Next.js 15 app: `apps/web`. Public homepage merged in PR #395, commit `7c71471010c9568a791371ab044da8e504ecca1f`.
- Root `/` now renders product marketing, while `/login` uses existing application authentication.
- `apps/web/next.config.ts` requires a valid public Supabase URL and publishable key for non-demo production builds; deliberately avoid supplying placeholders or service-role keys.
- `apps/web/src/middleware.ts` performs per-request nonce/CSP setup and method gating; any new Cloudflare runtime must prove this works.
- Cloudflare account currently has Pages project `minarvabiz-license-admin`, which builds `apps/license-admin/out` from `main`. **Never repurpose or overwrite it for the storefront.**
- There is no verified public customer storefront deployment URL. Existing authenticated application still relies on Vercel.
- Latest published Windows installer is v1.0.15, linked through the repository release page. Homepage displays neither fabricated pricing nor a working signup.

## Hosting decision

Keep the existing Next.js business application and shared workspace packages intact. Assess the Cloudflare Workers-compatible adapter on an isolated deployment branch; do not replace the Next.js runtime, remove Vercel, or migrate authentication as part of a marketing-only change.

Cloudflare's 2026 Next.js guide recommends `vinext` for **existing Next.js 16** apps. This repository uses Next.js 15, so that migration cannot be assumed safe. The Cloudflare OpenNext adapter documents support for Next.js App Router, SSR, route handlers and middleware, but compatibility must be validated against the **exact installed Next.js and adapter versions** before changing the lockfile. No paid R2/AI/payment dependency may be automatically provisioned.

References:
- https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/
- https://opennext.js.org/cloudflare/get-started

## Ordered acceptance gates

1. Select and pin a compatible adapter/Workers runtime with dependency and license checks; preserve `pnpm-lock.yaml` integrity.
2. Build `apps/web` using production-safe public configuration and run the adapter build with zero secret output. Production must not use `demo` bypass.
3. Verify dynamic middleware nonce/CSP, allowed methods, login, password recovery, Supabase data access, API route behavior, and tenant role isolation under the actual Cloudflare runtime.
4. Provision a **separate** Cloudflare storefront/worker, not the existing License Admin Pages project. Release only to a non-production preview address initially.
5. Request unauthenticated `GET /`, navigation anchors, mobile viewport smoke, `/login`, release/download target, and nonexistent route. Confirm no session tokens or credentials leak through cache, HTML or headers.
6. Run signed-in cross-tenant negative tests and authorized Online workflows, then Windows Offline/Hybrid regression. Test rollback using existing Vercel deployment as fallback.
7. Document the verified public URL, deployment identifier, exact commit and checks. Only then call FRONTEND-02 delivered.
8. Implement FRONTEND-03 signup behind verified server-side organization/bootstrap and trial-entitlement authority; no client-controlled admin roles. Do not enable a decorative signup button before the workflow is safe.
9. Decommission Vercel only after FRONTEND-04 application acceptance plus customer UAT, monitored cutover and rollback evidence.

## Current blockers

- No separate Cloudflare storefront project/deployment and live URL.
- No verified adapter build against exact Next.js 15 lockfile.
- No Cloudflare end-to-end login/API/tenant tests.
- No authenticated self-service signup/trial bootstrap.

Overall Master Vision remains **~51% provisional**; this audit does not change the completion figure and is not itself a deployed storefront.
