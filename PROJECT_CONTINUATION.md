# Minarva Biz — Authoritative Project Continuation

**Last updated:** 2026-10-03  
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

After PR #231:

- current verified main before this maintenance milestone: **`317076e2b90a6c225f37659fbb1c533c2acb32de`**
- PR #231 merged the governed read-only Claude independent PR review execution layer
- Claude review remains gated/disabled until repository authentication + enable variable are configured
- stable Windows release remains **v1.0.15**
- stable Windows release remains **v1.0.15**
- PR #218 merged the durable global AI-first master plan, capability registry, AI registry, competitor baseline and engineering reuse policy
- PR #220 routed normal named-admin License Admin operations browser -> Supabase Auth / Cloudflare directly
- PR #224 removed normal page-hydration dependence on legacy server reads; only explicit emergency fallback still hydrates through legacy server actions
- PR #225 removed obsolete normal named-admin password/MFA/adoption server paths and kept the legacy server session restricted to emergency access
- PR #226 moved normal named-admin logout fully browser-side and renamed/restricted the remaining server logout to `logoutEmergencyAdmin`
- PR #227 advanced the durable continuation checkpoint through PR #226
- PR #228 added the Cloudflare first-admin bootstrap authority foundation, browser CORS/readiness checks and production diagnostics required for the replacement bootstrap path
- PR #228 final head: `5ff4b69b56db7e5c62ec2226a241a70acab1a6cf`
- all **12 workflows triggered by PR #228 were GREEN** before merge
- PR #229 merged the authoritative multi-model review + innovation governance; all **11 workflows triggered by PR #229 were GREEN** before merge

Current normal named-admin behavior:

- password authentication occurs browser -> Supabase Auth
- TOTP enrollment/challenge/verification occurs browser -> Supabase Auth
- resulting AAL2 token is verified at Cloudflare `/api/admin/me`
- verified AAL2 session is kept only in browser `sessionStorage` for the current tab/session
- no refresh token is persisted in this phase; expiry fails closed and requires sign-in again
- normal identity, license registry, support inbox, license issue, status changes, offline activation, support updates and customer provisioning call Cloudflare directly
- normal logout clears the browser session and calls Supabase local logout directly; it does **not** call the legacy server logout action
- legacy server session/logout paths are now explicitly emergency-only
- first-admin bootstrap and emergency break-glass remain transitional server-side flows

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

Normal named-admin authentication, business operations, page hydration and logout are also no longer dependent on the legacy Render/Next server path.

Remaining Render/Next migration scope is now limited mainly to:

- first-admin bootstrap, which still requires privileged server-side Auth/DB administration;
- emergency break-glass login/session/logout and emergency-only legacy business-operation fallback;
- License Admin UI hosting itself, which still runs on the transitional Next hosting path;
- server-side privileged helpers retained only because bootstrap/emergency compatibility still depends on them.

Do not remove Render configuration/service until first-admin bootstrap, emergency access and License Admin UI hosting have verified replacements.

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

Continue Render removal in small verified steps.

Recommended next sequence:

1. **Complete the browser/UI cutover for first-admin bootstrap using the Cloudflare bootstrap authority added in PR #228, then retire the legacy privileged server bootstrap path only after end-to-end verification.** Do not redesign the authority foundation again.
2. Re-evaluate emergency break-glass design for Cloudflare/self-host portability. Preserve a real emergency path; do not delete the capability merely to remove Render.
3. Verify a Cloudflare-compatible License Admin UI deployment path and migrate the UI hosting while preserving all named-admin/bootstrap/emergency behavior.
4. Only after all above paths are verified, remove Render configuration/service.
5. Start Global Core audit + self-service Subscription/Entitlements foundation.
6. Then Local-first Sync v2 / multi-branch correctness and formal Vyapar-parity gap audit.
7. Establish Minarva Intelligence platform foundation before large-scale AI feature rollout.
8. Continue capability-by-capability implementation from `docs/CAPABILITY_REGISTRY.md` without scope reduction.
9. For substantial milestones, apply `docs/MULTI_MODEL_REVIEW_GOVERNANCE.md`: automated evidence remains mandatory; independent AI reviewers are advisory and the final decision is based on verified repository/runtime evidence.
10. When the governed Claude workflow is enabled, read and disposition Claude findings before final merge. Claude access stays read-only and must never receive production secrets.
11. Claude workflow supply-chain pin is maintained against Anthropic's reviewed immutable release; current reviewed target is v1.0.240 / `ed670b4cf9de2a5a570d130d2f6197b9e543cd64`.

## 16. Small-milestone rule

Do not try to build the entire master plan at once.

Each milestone must be independently reviewable and mergeable. The user explicitly prefers small milestones because long chats can be interrupted. **This is not permission to ship simplified or reduced features.** If a full capability requires many milestones, complete all required milestones and only mark the capability complete when its agreed behavior and verification are satisfied.

If a chat ends, the next chat must continue from live repository state and these documents, not reconstruct the project from memory.
