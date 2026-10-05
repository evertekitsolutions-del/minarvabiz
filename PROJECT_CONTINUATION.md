# Minarva Biz — Authoritative Project Continuation

**Last updated:** 2026-10-05  
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

Customer-facing license/update traffic is Render-free.

Normal named-admin authentication, business operations, page hydration, logout and browser-native first-admin bootstrap no longer require the legacy Render/Next privileged path. Fresh-instance regression proof now exists and the obsolete privileged normal first-admin server helpers have been removed.

Remaining Render/Next migration scope is intentionally narrower:

- the PostgreSQL emergency authority foundation is now merged and fresh-instance verified
- remaining emergency cutover work is Worker routes -> browser emergency-session cutover -> parity E2E -> legacy Next emergency helper retirement
- current production emergency UI still depends on Next server cookies/actions until that replacement is proven
- preserve the existing emergency security properties during migration: explicit opt-in, named emergency actor, short revocable session, rate limiting/backoff, audit trail, current/previous secret rotation with bounded grace, defense against edge-secret-only bypass, and fail-closed database/session validation
- verify a Cloudflare-compatible License Admin UI hosting path while preserving named-admin, bootstrap and emergency behavior
- remove transitional Render configuration/service only after emergency replacement and UI hosting are verified

Live production already contains an active License Admin identity. **Do not reset/delete production admin state for bootstrap testing.** The isolated fresh-instance harness is the authoritative open-registry regression test going forward.

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

Continue emergency cutover without reducing or disabling the current break-glass capability.

Recommended next sequence:

1. **Create a zero-secret-exposure synchronization path for the existing Render emergency credential configuration into the private PostgreSQL digest registry.** The raw current/previous credential must remain inside the existing trusted server process; only SHA-256 digests may cross into PostgreSQL.
2. Preserve the existing emergency enable flag, named actor identity and previous-credential validity semantics. Do not invent credentials, do not expose values to chat/logs, and do not enable Cloudflare emergency login until the digest registry and edge actor config are proven aligned.
3. Add deterministic tests proving synchronization is idempotent, rotation-safe, bounded, fail-closed, and cannot accidentally clear a valid current credential on missing/invalid environment configuration.
4. After safe synchronization proof, configure the Cloudflare emergency actor/enable state and verify live status/login/me/logout with an authorized origin while keeping the old Next/Render path available.
5. Cut the License Admin emergency UI/session from Next server cookies/actions to browser -> Cloudflare bearer session; keep legacy server helpers until parity E2E passes.
6. Only after parity E2E, retire the obsolete Next emergency cookie/session/service-role machinery and then verify Cloudflare-compatible License Admin UI hosting before final Render removal.
7. Continue Global Core, Subscription/Entitlements, Local-first Sync v2, Vyapar-parity and Minarva Intelligence milestones per the master plan.

## 16. Small-milestone rule

Do not try to build the entire master plan at once.

Each milestone must be independently reviewable and mergeable. The user explicitly prefers small milestones because long chats can be interrupted. **This is not permission to ship simplified or reduced features.** If a full capability requires many milestones, complete all required milestones and only mark the capability complete when its agreed behavior and verification are satisfied.

If a chat ends, the next chat must continue from live repository state and these documents, not reconstruct the project from memory.
