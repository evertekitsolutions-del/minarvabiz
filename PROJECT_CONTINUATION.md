# Minarva Biz — Authoritative Project Continuation

**Last updated:** 2026-10-08  
**Repository:** `evertekitsolutions-del/minarvabiz`

This file is the first document a new ChatGPT/work session should read after verifying live GitHub state.

## 1. Mandatory continuation protocol

For every new chat or every user message meaning **Continue**:

1. fetch the actual `main` HEAD;
2. inspect open PRs/issues and current workflow state;
3. read this file;
4. read `docs/MASTER_PRODUCT_PLAN.md`;
5. read `docs/CAPABILITY_REGISTRY.md`;
6. read `docs/AI_CAPABILITY_REGISTRY.md` when the milestone touches product/AI scope;
7. read `docs/ENGINEERING_REUSE_POLICY.md` before substantial implementation/refactor work;
8. never restart already merged work unless live evidence shows a regression;
9. complete only the next small milestone without reducing the agreed final feature scope;
10. research existing Minarva code, official SDKs and license-compatible open-source implementations before substantial custom coding;
11. branch -> implement -> test -> PR -> wait all required checks -> fix failures -> merge only when green;
12. update this continuation file whenever the authoritative next step materially changes.

Do not rely only on chat memory. The repository documents are the durable source of truth.

## 2. Permanent product vision

Minarva Biz is a **global, AI-first, local-first business operating platform for SMBs**, not a boutique-only billing application.

Long-term target:

- billing;
- accounting;
- inventory;
- POS;
- procurement;
- CRM;
- HR / Attendance Grid / payroll;
- online store;
- business website;
- domain purchase/renewal;
- marketing;
- manufacturing;
- field service;
- projects;
- industry packs;
- country/tax packs;
- AI agents;
- integrations/marketplace;
- self-service subscription/entitlements;
- local-first multi-branch sync;
- future Minarva-owned/self-hosted infrastructure.

The master definition is `docs/MASTER_PRODUCT_PLAN.md`.

## 3. Non-negotiable architecture rules

- one shared core; no separate codebase per industry;
- country-specific compliance belongs in Country Packs;
- industry differences belong in Industry Packs;
- Online + Offline Windows + Hybrid share business logic;
- Windows/branch operations should remain usable offline wherever reasonable;
- SQLite is the local-first desktop store;
- PostgreSQL-compatible central data model is the shared cloud/global authority;
- sync must be branch-aware, idempotent and event/ledger-safe;
- primary business data must not be trapped in provider-specific proprietary storage;
- object storage must have an S3-compatible migration path;
- AI must be provider-neutral and later support Minarva-owned inference;
- no mandatory recurring paid infrastructure dependency before the first 25 paying customers unless explicitly approved;
- 25 customers is a review point, not automatic permission to spend;
- any provider integration must define export/migration/replacement behavior;
- implementation difficulty must not silently reduce or delete an agreed feature;
- “small milestone” means sequencing only, not a simplified final product;
- blockers must be root-cause-fixed rather than hidden by disabling required behavior;
- external code may be reused only after source, license, security, maintenance and portability checks;
- publicly visible GitHub code without a clear compatible license must not be copied.

## 4. Current commercial release

Stable Windows release remains:

- **v1.0.15**
- installer: `MinarvaBiz-Setup-1.0.15.exe`
- installer SHA-256: `9556d3ad6b3db4818f19f5c7abc53c3b191977ff684ffaf2c5f8d86ac72a1576`

Recent Cloudflare/admin backend work does not by itself require a new Windows release.

## 5. Latest verified development state

First-admin browser cutover, fresh-instance proof and privileged server-helper retirement are now merged:

- PR #236 merged the browser-native first-admin bootstrap cutover; merge commit: **`358dacd11f006298e0694bb4cae92c34ee39564e`**
- PR #237 merged provider-neutral HTTPS / loopback-local Supabase origin portability for Cloudflare; merge commit: **`0a3cce3f40f8f619c74a3827e3c8753145f2f1ed`**
- PR #238 merged the isolated fresh-instance proof and migration-history recovery milestone; merge commit: **`420638c824887bfa9a3b4537d881a87297fb540e`**
- PR #238 final tested head **`d9068071e6786ef534d8304ef1cf597bf7793fe0`** passed all normal gates; the dedicated fresh-instance workflow replayed **65 repository SQL migrations** transactionally on a brand-new official Supabase local stack and passed the complete first-admin path
- the proof covers: empty admin/Auth state, bootstrap status, invalid/wrong-email rejection, reservation anti-rotation, reserved-email anti-theft, Cloudflare random unknown initial credential, tenant-bootstrap exclusion, mailbox confirmation, mailbox-owned password setup, AAL1 claim rejection, real TOTP enrollment/challenge/verification, AAL2 claim, `/api/admin/me`, second-claim closure, and post-bootstrap normal customer org/profile/membership/HQ creation
- no production Admin identity was reset or deleted and no production data was used to manufacture an open-registry state
- no paid dependency or new Minarva runtime dependency was introduced; the E2E uses official Supabase CLI **2.119.0** and immutable-pinned official `supabase/setup-cli` **v3.0.1**
- fresh replay exposed repository migration-history drift; production migration history was used read-only to restore the missing applied `20260911_rls_security_hardening`, `20260911_rls_policy_cleanup`, and `20260911_performance_cleanup` SQL, restore `006_integrity_indexes.sql` to the SQL actually applied in production, and order tenant bootstrap before the later policy alignment that depends on it
- corrective migration `20261005_license_admin_bootstrap_metadata_sanitization.sql` enforces the trusted bootstrap metadata invariant across Auth user inserts/updates and strips transient `account_type` / `bootstrap_token` carriers from both Auth user and identity metadata
- PR #239 retired the obsolete privileged normal first-admin Next/Render server helpers `firstAdminBootstrapStatus` and `bootstrapFirstLicenseAdmin`, plus private support code used only by those helpers; merge commit: **`59b2cee66461b0928722bc04c2e5c9cee3869dc7`**
- PR #239 final tested head **`4c18156bfcbde0c8a7c281e054c48083270966a4`** passed **First Admin Fresh Instance E2E**, CI, Windows Feature Click Smoke, Windows Deep Installed Smoke, Licensing Smoke, SAST, Dependency Security, SBOM/License Policy, Coverage Ratchet, Secret Scan, Staging Security + Performance and Final Release Audit; Claude review remained skipped by governance/config
- the post-retirement fresh-instance E2E explicitly proves the normal bootstrap UI has no server-actions dependency, the retired privileged first-admin exports are absent, and `loginEmergencyAdmin` / `logoutEmergencyAdmin` remain present
- stable Windows release remains **v1.0.15**; these control-plane milestones do not themselves require a new Windows release

Current normal named-admin behavior:

- password authentication occurs browser -> Supabase Auth
- TOTP enrollment/challenge/verification occurs browser -> Supabase Auth
- resulting AAL2 token is verified at Cloudflare `/api/admin/me`
- verified AAL2 session is kept only in browser `sessionStorage` for the current tab/session
- no refresh token is persisted in this phase; expiry fails closed and requires sign-in again
- normal identity, license registry, support inbox, license issue, status changes, offline activation, support updates and customer provisioning call Cloudflare directly
- normal logout clears the browser session and calls Supabase local logout directly; it does **not** call the emergency server logout action
- browser-native first-admin setup is Cloudflare/Postgres + Supabase Auth: status -> reserved signup -> email ownership -> mailbox-owned password -> TOTP AAL2 -> first-admin claim -> `/api/admin/me`
- the obsolete privileged normal first-admin server helpers are removed from `main`
- PR #241 merged the additive Cloudflare/self-host portable emergency authority foundation; merge commit: **`a6057ebeecfddf8ed29cceb156c68717106dac33`**
- PR #241 final tested head **`62fe84c26d3a312ca140489d158b8c820cab0e93`** passed the fresh-instance E2E plus all normal CI/security/Windows gates
- the emergency foundation adds a private current/previous emergency credential SHA-256 registry, bounded previous-credential grace, persistent rate limiting/backoff, admin-only <=15 minute revocable emergency sessions, SHA-256-only session-token storage, and login/logout audit
- the fresh-instance E2E exposed and additively fixed the historical `record_license_admin_login_failure()` PL/pgSQL column/output-name ambiguity; historical migration files remain unchanged
- defense in depth is explicit: the generic edge RPC secret alone cannot mint an emergency admin session; a matching private emergency credential digest is also required
- existing Next/Render emergency login/logout remains operational and must stay until the Worker/browser replacement is proven end to end
- PR #243 merged Cloudflare emergency status/login/me/logout routes; merge commit: **`fb9806194b839b2f342a46ef1237bcea34340df1`**
- PR #243 final tested head **`e0f00f984eff43aef6a76159e592845ec7b0f6d8`** passed Cloudflare Edge Smoke, 67-migration fresh-instance E2E, Worker emergency route E2E, CI, Windows Deep/Feature Click, SAST, dependency/license/secret/release/staging and coverage gates
- production Supabase now has `license_admin_bootstrap_metadata_sanitization`, `cloudflare_admin_emergency_authority`, and `cloudflare_admin_emergency_status` applied and verified; private emergency credential registry remains intentionally empty
- production Cloudflare Worker was updated from merged `main` content only; deployment **`2e61ceb4-92d0-4888-a20c-1370c42e46ba`**, version **`db1ff2c4-7f01-4ee4-a328-4945ff04c020`**, 100% traffic
- Worker bindings/secrets were preserved exactly; no emergency-enable/actor binding was added, so Cloudflare emergency login remains disabled in production and the existing Next/Render emergency path remains authoritative
- production post-DDL security advisor has no new critical finding; deny-all private/RBAC tables and edge-secret RPC WARN/INFO findings are intentional architecture findings, while leaked-password protection remains a separate existing configuration warning
- PR #245 merged the zero-secret-exposure legacy emergency authority synchronization bridge; merge commit: **`9eb29aa1d9468087937600ebb22c23cc3b56c220`**
- PR #245 final tested head **`d7aa8f9f7c434c32f880a6f023219d3ec917d7dd`** passed fresh-instance E2E, CI, Windows Deep/Feature Click, Coverage, SAST, Dependency Security, SBOM/License Policy, Secret Scan, Licensing Smoke, Staging Security + Performance and Final Release Audit
- the sync path hashes the existing Render current/active-previous emergency credentials inside the trusted server process and sends only SHA-256 digests plus safe enable/actor metadata to a service-role-only PostgreSQL RPC
- synchronization is idempotent, rotation/rollback-safe, bounded to the existing <=24-hour previous-credential grace, audit-safe, and missing/invalid legacy config cannot clear a valid current authority
- production Supabase migration `license_admin_emergency_legacy_sync` is applied and verified: anon/authenticated cannot execute the sync RPC, service-role can execute it, and direct private-table SELECT remains denied even to service-role
- Render startup wiring was root-cause-fixed in `render.yaml`: the digest sync script must execute before `next start`; CI has a regression guard for this exact production start contract
- production private emergency credential/runtime registry is currently still empty, so the Render startup sync has **not yet been observed in production**; Cloudflare emergency login remains disabled and the existing Next/Render emergency path remains authoritative

## 5A. Active Render-retirement cutover milestone

- PR #249 merged the browser-native emergency Cloudflare UI; browser emergency login/session/business operations no longer require the legacy Next/Render cookie interaction.
- PR #250 merged named AAL2 self-service emergency authority. A named Supabase administrator with TOTP AAL2 and role `admin` can rotate or disable emergency authority through Cloudflare/PostgreSQL; Cloudflare generates the credential, PostgreSQL stores only SHA-256, and plaintext is returned once to the authenticated browser.
- Manual emergency ownership rejects later legacy Render synchronization, so copying the old Render credential is no longer a cutover prerequisite.
- **PR #251 is the active milestone**: retire the Render-dependent License Admin runtime definition and active server-side UI hydration/mutation path while preserving browser -> Cloudflare administration, emergency rollback safety, request-bound CSP nonces, Ed25519 license-key portability, and all security/compliance gates.
- PR #251 removes `render.yaml` from the repository and removes legacy startup synchronization from the License Admin start command. This repository change does **not** authorize deleting/disabling the live production Render service before the named AAL2 manual emergency credential has been established and production Cloudflare emergency login/me/business/logout/revocation/backoff parity is proven.
- The dependency-security gate discovered the upstream Sharp/libvips advisory during this milestone. The branch pins patched Sharp >=0.35.5 and explicitly reviews the resulting LGPL libvips runtime under the existing distribution-compliance obligations.
- After PR #251 exact-head gates are green and it is merged, the next operational step is additive production migration/deployment from merged `main`, named AAL2 self-service emergency rotation, live parity proof without exposing the raw credential, and only then retirement of the live Render fallback.
- Vercel remains a separate mandatory-dependency retirement milestone after Render cutover proof; it must be migrated with provider-neutral/self-host parity rather than simply disabled.

## 5C. October 8 License Admin security and portability continuation

- PR #259 merged recovery-token hardening: Supabase recovery bearer credentials are captured only in memory and scrubbed from the browser URL/history before user interaction.
- Production named-admin authority was verified against `public.license_admin_identities` and `cloudflare_admin_me()`; the active linked identity is role `admin`, and the RPC requires AAL2. The unrelated historical `profiles.role` table is not the License Admin authority.
- PR #260 merged named-AAL2 emergency self-service UI. It exposes safe status/create/rotate/disable controls only to named admin sessions; one-time raw emergency credentials remain React memory only and require explicit save acknowledgement before dismissal or another destructive control action.
- Production emergency authority remains intentionally disabled/uninitialized until the named administrator performs the browser-only credential creation step and stores the one-time credential locally without sharing it.
- PR #261 is the active portability milestone. It replaces source-level Cloudflare Worker endpoint coupling across normal admin, bootstrap/auth, emergency login/control/logout and password recovery with validated client-safe `NEXT_PUBLIC_LICENSE_EDGE_URL`; remote origins require HTTPS and HTTP is accepted only for loopback development. The current Worker remains a transitional default so existing production keeps working.
- PR #261 first CI attempt exposed a literal escaped-newline insertion in four TypeScript imports; this is a branch implementation defect, not an architecture blocker. It was root-cause-fixed on the same branch and must pass a fresh exact-head gate set before merge.

## 5B. Provider-neutral License Admin hosting merged

- PR #252 merged on 2026-10-07 with merge SHA `0f3d9d36a24e45e6e526468212f14ca0a0fb215d`.
- License Admin is now a browser-only Next static export. The deployable artifact is `apps/license-admin/out/`; it can be served from any HTTPS static host or future Minarva-owned server.
- Obsolete Next server actions, service-role helpers, signing-key server module, License Admin API routes, middleware, and Render-era server smoke contracts were removed from the active License Admin host.
- License/support/customer-provisioning/admin authentication operations are browser -> Cloudflare/PostgreSQL authority only.
- Security-header expectations for the static artifact live in `apps/license-admin/public/_headers` and are enforced by CI; no privileged server secrets may appear in the exported artifact.
- Licensing/update/support contract tests now assert the Cloudflare edge authority rather than deleted Next API routes.
- PR #252 exact head `371b7c25e27334c2eaf1af8f8f545a3701603f95` passed CI, Coverage Ratchet, First Admin Fresh Instance E2E, Staging Security + Performance, Dependency Security, SAST, SBOM/license policy, Licensing Smoke, Final Release Audit, Secret Scan, Windows Deep Installed Smoke, and Windows Feature Click Smoke before merge.
- Production Cloudflare `LICENSE_ADMIN_ALLOWED_ORIGINS` still points at the existing Render License Admin origin. Do not remove that live origin/service until the merged static artifact is deployed to a replacement HTTPS origin, that origin is added additively, named AAL2 admin operations are proven, manual emergency authority is established, and emergency parity is proven.
- Production emergency runtime configuration was last observed uninitialized; raw emergency credential handling remains an interactive browser-only security boundary and must never be copied into chat, GitHub, logs, or hosting configuration.
- Next implementation milestone: establish a deployable provider-neutral replacement origin for the merged static artifact, add it to Cloudflare allowed origins without removing Render, run named AAL2 + emergency parity proof, then retire the live Render fallback. After that, remove Vercel as a mandatory online-app dependency using the same additive/provider-neutral method.

## 5C. Provider-neutral static artifact bridge merged

- PR #255 merged on 2026-10-07 with merge SHA `1b94287ee4d5711f1a8957734351511bf4c768ce`.
- A dedicated `License Admin Static Artifact` workflow now builds `apps/license-admin/out`, runs the static-artifact secret/security contract, and publishes a short-retention provider-neutral artifact on both PR and main workflows.
- PR #255 exact head `725fb9b4773605c5fbcdb9508cc32c25bf5367df` passed the static-artifact workflow plus CI, Coverage Ratchet, Windows Deep Installed Smoke, Windows Feature Click Smoke, Dependency Security, SAST, SBOM/license policy, Licensing Smoke, Secret Scan, Staging Security + Performance, and Final Release Audit before merge.
- The verified PR artifact digest was `sha256:47f7aebb5534c9f3d373d0e79749b578bc8c99b7528d88393f8209b8762cd74c`; artifact retention is intentionally short and it contains no privileged server secrets.
- Cloudflare Pages project `minarvabiz-license-admin` exists and its Direct Upload token endpoint is operational. Automatic GitHub source attachment remains blocked by Cloudflare Pages error 8000011 (internal Git installation issue), not by application code.
- Do not remove the Render production fallback yet. The next safe live step is to Direct Upload the verified static artifact to the Pages project (or repair the Cloudflare Git installation), then add the new HTTPS origin to `LICENSE_ADMIN_ALLOWED_ORIGINS` while retaining Render, and prove named AAL2 + emergency parity before Render retirement.
- The connected Cloudflare API can issue the Pages short-lived upload token, but the current connector boundary cannot stream the GitHub artifact bytes into the Pages asset upload API in one operation. Do not create or expose a long-lived Cloudflare API token merely to bypass this boundary.

## 6. Cloudflare License/Admin state

Production worker:

- name: `minarva-biz-license-edge`
- public front door: `https://minarva-biz-license-edge.minarva-biz.workers.dev`

Current customer-facing Cloudflare-native routes include:

- health;
- public verification key;
- signed update manifest;
- commercial activation;
- validation;
- deactivation;
- trial registration.

Current License Admin Cloudflare-native capabilities include:

- admin identity/AAL2 authorization;
- license registry read;
- support inbox read;
- support request update;
- license status management;
- commercial license issuance with Cloudflare signing authority;
- offline activation package preparation/signing;
- online customer provisioning through Supabase Magic Link;
- browser auth config;
- first-admin bootstrap status;
- first-admin short-lived signup reservation;
- first-admin AAL2 claim;
- admin identity verification.

No new Render dependency should be added.

## 7. Supabase role

Supabase remains the current PostgreSQL/Auth data layer. Do not remove it merely to reduce provider count.

Current design intentionally uses:

- PostgreSQL/RLS;
- Supabase Auth;
- publishable-key + caller JWT for scoped authenticated admin RPCs;
- narrow SECURITY DEFINER functions that validate AAL2/admin permissions;
- no service-role/secret key in the Cloudflare admin read/write paths already migrated.

Maintain PostgreSQL portability for future self-hosting.

## 8. Render removal status

Customer-facing license/update traffic and normal named-admin control-plane traffic are Render-free.

PR #249 merged the browser-native Cloudflare emergency UI/session path. PR #250 establishes the Render-independent emergency self-service authority: a named Supabase administrator at TOTP AAL2 with role `admin` can rotate or disable emergency authority through Cloudflare + PostgreSQL. Cloudflare generates the strong emergency credential, PostgreSQL receives only its SHA-256 digest, and plaintext is returned once to the authenticated browser. Manual ownership prevents later legacy Render startup synchronization from overwriting the authority.

The old Render credential/digest synchronization is therefore **not a production cutover prerequisite**. It remains rollback compatibility only until manual self-service ownership is established and the live replacement is proven.

Before removing the legacy Next/Render emergency path:
- deploy the additive PR #250 database migration and merged Worker from `main`;
- use the existing named production admin at AAL2 to establish manual emergency authority without exposing the returned credential in chat, logs, docs or source control;
- prove live Cloudflare emergency status/login/me/business operations/logout, revocation, previous-credential grace, origin enforcement and backoff/rate limiting;
- regression-prove named AAL2 admin operations;
- verify the provider-neutral License Admin UI hosting/origin path;
- only then retire obsolete Next emergency cookie/session/service-role machinery and transitional Render service/configuration.

Live production already contains an active License Admin identity. **Do not reset/delete production admin state for bootstrap testing.** Additive production migrations only. Keep the existing fallback until the replacement has full live parity proof.

## 9. Current signing authority

Current Cloudflare-derived Ed25519 verification key is served by the production Cloudflare `/api/public-key` endpoint and must be live-verified before release/signing checks.

Do not hard-code an old verification key into continuation docs or clients; the older v1.0.14 key is historical only.

Commercial licenses and offline activation certificates must use the Cloudflare-derived signing authority.

## 10. Product-scope authoritative documents

Read these before feature planning:

1. `docs/MASTER_PRODUCT_PLAN.md` — global product/architecture/phases;
2. `docs/CAPABILITY_REGISTRY.md` — full capability inventory/checklist;
3. `docs/AI_CAPABILITY_REGISTRY.md` — cross-module AI roadmap and safety rules;
4. `docs/COMPETITOR_CAPABILITY_BASELINE.md` — Vyapar + global competitor benchmark;
5. `docs/ZERO_COST_GROWTH_ARCHITECTURE.md` — first-25-customer cost/portability rules;
6. `docs/ENGINEERING_REUSE_POLICY.md` — no-scope-reduction, root-cause-fix and license-safe reuse rules;
7. `docs/MULTI_MODEL_REVIEW_GOVERNANCE.md` — independent AI review, innovation review, Claude GitHub review integration rules and final-decision governance.

`docs/WORLD_CLASS_FEATURE_ROADMAP.md` is historical/high-level; the documents above supersede it when scope conflicts.

## 11. Competitor/product rule

Minarva must continuously research and benchmark useful capabilities from:

- Vyapar;
- QuickBooks;
- Zoho;
- Odoo;
- Shopify;
- Square;
- Xero;
- relevant regional competitors.

Do not copy proprietary code/UI/branding. Capture capabilities and design Minarva-native workflows.

Vyapar parity is a baseline, not the endpoint.

## 12. AI rule

Every major new module must explicitly review:

- AI assistance;
- AI search/reporting;
- AI prediction;
- AI automation;
- AI agent actions.

Use `docs/AI_CAPABILITY_REGISTRY.md`.

Consequential actions require policy/approval/audit. AI must not silently post irreversible financial, tax, security or high-impact HR actions.

## 13. Local-first multi-branch rule

Target architecture:

```text
Branch Windows / POS / Mobile
        |
     SQLite
        |
 Outbox + Event Ledger
        |
   Sync Gateway/API
        |
 Central PostgreSQL
        |
 Other branches / Web / Owner views
```

Stock is location-specific. Global stock is derived.

Cross-branch transfer should represent source -> in-transit -> destination receipt.

Every synchronized business event must support unique identity/idempotency.

## 14. Commercial model target

Normal SaaS customer experience should become:

```text
Sign up
 -> select country + industry
 -> select plan/add-ons
 -> pay/start trial
 -> organization provisioned
 -> entitlements activated
 -> app unlocks automatically
```

Manual license keys remain an implementation/fallback detail, not the standard user journey.

The Control Plane must eventually support subscription, plan, add-on, seats, branches, devices, storage, AI allowances, grace/recovery and customer self-service.

## 15. Immediate next milestone

Finish PR #250 and perform the safe production emergency-authority cutover.

1. Require exact-head CI/security/fresh-instance/Windows gates green and merge PR #250 with current continuation documentation.
2. Apply the additive PR #250 migration to production PostgreSQL/Supabase and deploy the Cloudflare Worker from merged `main` only.
3. Through the existing named TOTP-AAL2 admin, establish `manual` emergency ownership using the self-service rotation path. Never expose the one-time plaintext credential or its digest in chat/logs/docs.
4. Prove live status/login/me/business parity/logout, session revocation, bounded previous-credential grace, origin enforcement, rate limiting/backoff and named-AAL2 regression.
5. Keep legacy Render/Next fallback until that proof is complete; then retire obsolete emergency cookie/session/service-role machinery and transitional Render service/configuration.
6. Verify and migrate remaining Vercel-hosting dependencies to the provider-neutral/self-hostable License Admin hosting path before removing Vercel as a mandatory dependency.
7. Resume Global Core, Subscription/Entitlements, Local-first Sync v2, industry/country packs, Vyapar-plus parity and Minarva Intelligence milestones per the master plan.

## 16. Small-milestone rule

Do not try to build the entire master plan at once.

Each milestone must be independently reviewable and mergeable. The user explicitly prefers small milestones because long chats can be interrupted. **This is not permission to ship simplified or reduced features.** If a full capability requires many milestones, complete all required milestones and only mark the capability complete when its agreed behavior and verification are satisfied.

If a chat ends, the next chat must continue from live repository state and these documents, not reconstruct the project from memory.

## 5D. October 8 MFA rotation milestone closed

- PR #261 merged as `f6dcd3bc6f24ebd6a4d054db9c53cc3e7dca6af3`: License Admin browser flows now use validated `NEXT_PUBLIC_LICENSE_EDGE_URL` with the current Cloudflare Worker only as a transitional default. Exact-head CI/security/static/Windows/fresh-instance gates passed and the production Pages deployment succeeded.
- PR #262 merged as `b4b64d66d1e818cf18ef72693ad2ee222c9f2617`: named AAL2 administrators can inventory TOTP factors and perform fail-safe rotation. The UI requires a replacement enrollment and successful verification in the current session before old-factor removal; the client refuses to remove the final verified factor; emergency sessions cannot access the control.
- PR #263 merged as `04385898512cff143efc6f327433e6543253379c`: CI now enforces the MFA rotation safety contract, including replacement-before-removal and no QR/secret persistence or logging patterns.
- Production Pages successfully deployed the #262 merge. #263 production deployment was triggered after merge and should be verified before any browser rotation.
- Production currently reports exactly one verified MFA factor. Because an earlier authenticator enrollment secret was exposed outside the intended local-only flow, treat the current factor as potentially compromised until the administrator uses the production Pages rotation UI. Never paste the replacement QR, secret, or TOTP code into chat or tooling.
- Rotation is an intentional browser-only boundary: after the #263 production deployment succeeds, sign in normally with AAL2, enroll and verify a fresh replacement authenticator, then remove the old factor. Repository automation must not create or retrieve that replacement secret.

## 5E. Provider-neutral main web runtime cutover started

- The main Next.js web runtime no longer changes security/runtime mode based on `VERCEL_ENV`. Demo mode is now explicit through `MINARVA_MODE` / `NEXT_PUBLIC_MINARVA_MODE`; a provider preview can no longer implicitly disable authentication.
- CI enforces a provider-neutral hosting contract: no Vercel host/runtime branching in `next.config.ts` or middleware, standard `next build` / `next start`, explicit production Supabase configuration, and explicit demo mode only.
- Existing `vercel.json` files remain deployment adapters during the safe migration window; they are not runtime business-logic dependencies. Do not delete the live Vercel online app until a replacement host is deployed and parity-tested.
- Production License Edge still has `MINARVA_ONLINE_APP_URL` pointing at the current Vercel online app. Change that binding only after the provider-neutral replacement URL is live and verified.


## 5F. Attendance Grid HR core candidate

- PR #273 is the HR-002 Attendance Grid delivery candidate.
- Shared Online + Offline + Hybrid domain now includes tenant-aware daily attendance statuses: present, absent, half-day, leave and holiday; per-day break/overtime metadata; staff/month summaries; and audited, outbox-backed upserts.
- Web and Windows desktop use the shared Attendance Grid UI with month navigation, per-staff daily marking and bulk today actions.
- Domain snapshot format is v13 and includes attendance so offline backup/restore and desktop persistence do not silently lose HR state.
- PostgreSQL/Supabase migration adds tenant-isolated `staff_attendance` with organization/staff/date uniqueness, branch/device/version fields, RLS + FORCE RLS and authenticated organization policy.
- Executable attendance behavior tests and source/security contracts are wired into CI. Do not mark HR-002 merged until PR #273 exact-head gates are green.

## 5G. Attendance Grid parity / daily time details — PR #275

- Live baseline was main `27bed7c3a44a4643653c7e3ae0fc86b4f0856bdd`: Attendance PR #273 had already merged with all exact-head required gates green. Duplicate PR #274 was closed unmerged; do not restart either branch.
- PR #275 continues that implementation: one shared Web/Windows grid, clock-in/out editor with timezone-bearing timestamps, break/overtime/notes, worked-minute and holiday summaries, branch filtering, archived history and guarded bulk actions.
- Status-only edits retain existing metadata. Domain validation rejects impossible dates/statuses, fractional/negative minutes and invalid clock/break ranges before mutation. Immutable versioned event snapshots preserve prior revisions.
- `/attendance` participates in lazy cloud hydration. Staff, attendance and branch reads are paginated; selected branch survives refresh. Attendance cloud transport lives in `apps/web/src/lib/data-source-attendance.ts` so the main data-source stays within its existing 900-line audit budget.
- Cloud writes await actual mutation and durable event acknowledgement. Ordered per-record draining, per-aggregate failure blocking, event-id replay and optimistic revision checks prevent silent overwrite or acknowledgement of empty updates.
- Pending corrections survive in-session cloud rehydration. Managers can retry or explicitly review local/cloud values and choose a cloud copy or audited local correction rebased on the current remote revision. Superseded events remain in local history as `discarded`. Deferred-read review rejects newer local edits; same-day different-device creations use a staff/date lookup and explicit canonical-ID rebase without duplicate-day totals.
- Online production browser persistence remains the existing session-only policy; do not claim failed changes survive browser closure. The UI warns to keep the window open until confirmed and installs a pending-change unload guard. Windows uses the existing SQLite snapshot v13 persistence.
- Additive migration `20261008140151_attendance_role_integrity.sql` restricts writes to organization super-admin/admin/manager roles, checks staff/branch tenant relations, protects immutable attendance identity and monotonic revisions, and constrains clock/break ranges without rewriting historical records.
- CI includes a real PostgreSQL red/green isolation test: the original policy must fail the cross-tenant-reference denial assertion; hardened policies must pass role, relation, update and tenant-read cases. Browser deep smoke exercises actual time entry and metadata retention.
- Reuse: existing Minarva grid, Modal/FormField, phase6 store, snapshot/outbox, authenticated PostgREST, and PostgreSQL RLS primitives; no third-party source copied and no recurring paid dependency introduced. Upstream PostgreSQL/Supabase RLS documentation and changelog reviewed.
- Independent review findings addressed: individual/bulk hidden-branch mutation, archived history loss, selected-branch reset, pending-hydration loss, acknowledgement replay ordering and genuine conflict resolution. Final independent review found no remaining verified critical/important defects after executable regression checks. Exact-head CI remains mandatory before merge.
- Full MASTER VISION estimate entered this batch at approximately **50%**. PR #275's implemented daily attendance/time-entry/cloud-parity scope is the batch's proposed additional percentage point; count approximately **51% only after its required exact-head gates pass and it is merged**. This is a full-master estimate, not a measured milestone ratio.
- HR shifts/rosters, leave-policy management, holiday calendars, late/early rules, biometric/geofence adapters, payroll/statutory packs and full employee self-service remain unfinished master scope. Do not mark those registry entries complete merely because the grid supports daily leave/holiday statuses or manual clock entry.
- Production attendance migrations/deployment and customer UAT must be separately verified; merged source is not a new Windows stable release. Keep v1.0.15 and existing infrastructure fallbacks until replacement/release parity is proven.
