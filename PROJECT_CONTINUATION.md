# Minarva Biz — Authoritative Project Continuation

**Last updated:** 2026-10-02  
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
7. never restart already merged work unless live evidence shows a regression;
8. complete only the next small milestone;
9. branch -> implement -> test -> PR -> wait all required checks -> fix failures -> merge only when green;
10. update this continuation file whenever the authoritative next step materially changes.

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
- any provider integration must define export/migration/replacement behavior.

## 4. Current commercial release

Stable Windows release remains:

- **v1.0.15**
- installer: `MinarvaBiz-Setup-1.0.15.exe`
- installer SHA-256: `9556d3ad6b3db4818f19f5c7abc53c3b191977ff684ffaf2c5f8d86ac72a1576`

Recent Cloudflare/admin backend work does not by itself require a new Windows release.

## 5. Latest verified development state

After PR #217:

- merged main target: **`14c7ab336b396e577e2d03ddd29be9c434184442`**
- PR #217: **Move named License Admin password and MFA to the browser**
- PR #217 final head: `7711bc6b65aba0db75c6f1b75bc6c25288cc4629`
- all 12 required workflows were GREEN before merge.

PR #217 behavior:

- normal named-admin password authentication now occurs browser -> Supabase Auth;
- TOTP enrollment/challenge/verification also occurs browser -> Supabase Auth;
- resulting AAL2 token is verified at Cloudflare `/api/admin/me`;
- transitional Next License Admin server receives only the already-verified AAL2 token to establish its existing short legacy UI session;
- password and TOTP code no longer traverse the normal Render/Next server path;
- emergency login and first-admin bootstrap remain transitional legacy paths.

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

Customer-facing license/update traffic is already Render-free.

Remaining Render/Next License Admin migration work is primarily the **legacy License Admin UI/server-session layer**, including transitional pieces such as:

- legacy initial server-side page hydration/business actions still used by UI;
- short legacy admin UI session;
- emergency break-glass login;
- first-admin bootstrap;
- remaining server-action/UI rewiring;
- final License Admin hosting migration.

Do not delete Render infrastructure until the entire Admin UI/auth/bootstrap/emergency path is verified elsewhere.

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
5. `docs/ZERO_COST_GROWTH_ARCHITECTURE.md` — first-25-customer cost/portability rules.

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

## 15. Immediate next milestone after this documentation plan is merged

Resume Render-removal work in small steps.

Recommended next sequence:

1. **Rewire License Admin read/business actions in the UI to use the browser's AAL2 Supabase token and Cloudflare admin endpoints directly**, removing dependence on the legacy server session for normal named-admin use.
2. Move logout/session state for normal named admins fully client/Cloudflare-native.
3. Design/migrate first-admin bootstrap without exposing privileged Auth administration.
4. Re-evaluate emergency break-glass design for Cloudflare/self-host portability.
5. Migrate the License Admin UI hosting to Cloudflare after compatibility verification.
6. Only then remove Render configuration/service.
7. Start the Global Core audit + self-service Subscription/Entitlements foundation.
8. Then Local-first Sync v2 / multi-branch correctness and Vyapar-parity gap audit.
9. Establish Minarva Intelligence platform foundation before large-scale AI feature rollout.

## 16. Small-milestone rule

Do not try to build the entire master plan at once.

Each milestone must be independently reviewable and mergeable. The user explicitly prefers small milestones because long chats can be interrupted.

If a chat ends, the next chat must continue from live repository state and these documents, not reconstruct the project from memory.
