# FRONTEND-02B — Cloudflare hosting readiness and deployment gates

Status: **separate Cloudflare customer preview deployed; authenticated commercial cutover NOT yet accepted**.

## 2026-10-16 — Separate premium visual design-review preview (not the application)

- Visual concept: https://minarvabiz-design-review.minarva-biz.workers.dev/
- Dedicated isolated Worker: `minarvabiz-design-review`; deployment ID `b7280dff-a431-4af4-b22b-29c193969fdc`, version `4991c030-8688-493c-9320-8aaa5ae85165`; workers.dev enabled, preview URLs disabled, no production domain route or new storage.
- Portable original HTML in `docs/previews/minarva-biz-premium-design-review.html`, regression contract in `scripts/website-design-review-contract.test.mjs`; sample UI and numbers must always be labeled illustrative. The preview is noindex and has no authentication, form handling, telemetry, customer data, or paid backend.
- This page is a **separate design-review site**, **not** proof that `apps/web` deployed to Cloudflare. Customer web Worker `minarvabiz-customer-web-preview` remains on its earlier version until its authenticated Next/OpenNext bundle passes deployment authority and rollout gates. Do not point customers to the concept site as a production app.
- Owner-visible preview is confirmed deployed in the Cloudflare API; separate unauthenticated outside-HTTP/browser test from this session is unavailable, so customer device/browser acceptance remains needed.
- The original PR #462 interactive product tour is already integrated in `apps/web`; this concept is for rapid visual review only, not a replacement for product source or real verified application screenshots.

## 2026-10-16 — Premium homepage Cloudflare CI/CD (preview deployment not yet verified)

The premium homepage was merged in PR #460, main commit 8d50a112685c8d655da876160125e875a26f90e6, but the deployed Cloudflare Worker has not yet been updated to this commit.

### Separate zero-paid preview delivery lane

- Workflow: .github/workflows/cloudflare-customer-preview-deploy.yml. Manual: GitHub Actions > Cloudflare Customer Preview Deploy > Run workflow (main only).
- Auto deployment after successful main CI requires repository variable MINARVA_PREVIEW_CD_ENABLED=true. Unset/default is disabled. It accepts only CI originating from a main push.
- Repository secrets required: MINARVA_CLOUDFLARE_ACCOUNT_ID, MINARVA_CLOUDFLARE_PREVIEW_API_TOKEN, MINARVA_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
- Repository variable required: MINARVA_PUBLIC_SUPABASE_URL, configured to the real public Supabase HTTPS URL. Use a dedicated limited Cloudflare deployment token; never commit or print credentials.
- Missing credentials fail before dependency installation or Worker mutation. The workflow checks all mandatory exact-main workflows, refuses pending/failed/missing checks and stale heads, and checks again immediately before deployment.
- Build once, Wrangler dry-run, then --deploy-only uploads exactly the checked compiled Worker. Production/demo bypass is refused and the fixed isolated preview Worker name is asserted.
- Post-deployment runtime checks cover CSP/nonce, login/recovery, unknown routes, and the premium homepage content. Capture verified deployment/version ID before reporting live delivery.
- No paid dependencies, migrations, customer data edits, production DNS changes, Vercel deletion, License Admin/Edge changes or Windows support URL cutover are part of this step.

Cloudflare API token and GitHub variables/secrets still require account provisioning before the preview can be updated; this milestone is source and workflow readiness, not a verified new live deployment.
## 2026-10-16 — Customer Worker preview delivered

- Preview: https://minarvabiz-customer-web-preview.minarva-biz.workers.dev/
- Customer login: https://minarvabiz-customer-web-preview.minarva-biz.workers.dev/login
- Worker deployment: `7fd3c6a9efc54a75b63e6a8232e25b2b`; separate from License Admin and existing edge Workers.
- Pinned Next.js 15.5.28, OpenNext Cloudflare 1.20.12 and Wrangler 4.151.0; production OpenNext build, web typecheck, complete business-logic suite and Wrangler dry-run passed locally.
- Actual compiled local workerd smoke passed homepage, login/recovery pages, document nonce propagation and rotation, prohibited methods, and unknown-route 404. Live homepage returned HTTP 200 with private/no-store cache policy; browser navigation to customer login verified.
- The deployment wrapper now parses the lockfile correctly, rejects explicit demo/auth bypass, and forces authenticated production settings into child processes so later ignored `.env*` files cannot weaken the build. CI builds and runs the compiled Worker on loopback for each PR.
- Standard `next build` / `next start` remain available; no paid storage, AI, database or service was provisioned. No production customer data changed.
- Remote compiled Worker runtime smoke and deployed security-header suite passed against the live preview, including nonce rotation. One initial network timeout was followed by a successful full rerun. This is unauthenticated runtime evidence, not signed-in production UAT.
- Live `/api/support/health` returned HTTP 503 with `ready:false`, `brokerConfigured:false`, `aiOperational:false`, `paidFallbackEnabled:false`. `MINARVA_SUPPORT_SERVICE_TOKEN` is not configured on the new Worker. The existing broker requires the same portable identity at both ends. Do not expose that token to clients, invent one-sided credentials, or switch the Windows release support URL before broker submission/inbox and AI readiness are actually verified.
- Remaining cutover gates: broker credential provisioning, signed-in tenant/role/data and billing acceptance, password recovery redirect delivery, real support inbox submission, Windows/Hybrid acceptance, release support URL change and monitored rollback. Existing Vercel production remains fallback with Git builds disabled.
- Registry dependency audit upload was blocked by automatic approval review because it would transmit private production dependency metadata to npm; no bypass or retry was attempted.

## 2026-10-16 — Customer hosting cutover safety

- **Vercel auto-deploy for every Git branch is disabled** in both repository-level `vercel.json` and `apps/web/vercel.json` via `git.deploymentEnabled: false`; legacy GitHub integration is also disabled. This is covered by a required CI contract test.
- The **last working Vercel production deployment is intentionally retained temporarily for rollback and existing customer access**. This is **not** an assertion that Cloudflare customer hosting works yet.
- Existing Cloudflare Pages project `minarvabiz-license-admin` and Workers `minarva-biz-free-ai`, `minarva-biz-license-edge` **are not** a verified hosted customer web application. Do not redirect or delete customer access until a real Cloudflare Worker deployment is tested end-to-end.
- `apps/web/wrangler.jsonc` targets the separate preview Worker. The compatible adapter and framework versions are pinned; production cutover still requires the acceptance gates below.
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

- Production customer cutover has not been accepted; use the separate preview URL above for validation.
- Adapter production build and local runtime passed; signed-in production acceptance remains outstanding.
- No Cloudflare end-to-end login/API/tenant tests.
- No authenticated self-service signup/trial bootstrap.

Overall Master Vision remains **~51% provisional**; this audit does not change the completion figure and is not itself a deployed storefront.
