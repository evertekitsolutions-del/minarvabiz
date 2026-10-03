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

After PR #220:

- current verified main: **`871d51febb34f807b327b1226688422afcdd779a`**
- open PRs at post-merge verification: **0**
- open issues at post-merge verification: **0**
- stable release remains **v1.0.15**
- PR #218 merged the durable global AI-first master plan and capability registries.
- PR #220: **Route normal License Admin UI directly through Cloudflare**
- PR #220 final head: `37d97612608a5fd7fb19e3dad21f09a0526063a7`
- all **11 workflows triggered by the PR were GREEN** before merge. The Cloudflare License Edge workflow was not triggered because PR #220 changed no Worker files.

PR #220 behavior:

- normal named-admin password + TOTP remains browser -> Supabase Auth;
- verified AAL2/TOTP admin session is kept only in browser `sessionStorage` for the current tab/session;
- no refresh token is persisted in this milestone; expired sessions fail closed and require sign-in again;
- normal named-admin identity, license registry and support inbox load directly from Cloudflare admin APIs;
- normal named-admin license issue, status changes, offline activation, support updates and customer provisioning call Cloudflare directly with the AAL2 bearer token;
- normal named-admin operations no longer require the legacy Next/Render admin session;
- emergency login and older transitional cookie sessions still use legacy server actions as compatibility fallbacks;
- first-admin bootstrap remains a transitional server-side flow.

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

Normal named-admin business operations are now also browser -> Cloudflare direct after AAL2 authentication. Remaining Render/Next migration scope is narrower:

- server-rendered initial page hydration still calls legacy `listLicenses()` / `listSupportRequests()` for emergency/older-cookie compatibility;
- legacy named-admin session/adoption and old password/MFA server actions remain in source although the normal UI no longer uses them;
- emergency break-glass login/session remains server-side;
- first-admin bootstrap still requires privileged server-side Auth/DB administration;
- License Admin UI hosting itself still runs on the transitional Next hosting path.

Do not remove Render configuration/service until bootstrap, emergency access and UI hosting have verified replacements.

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

## 15. Immediate next milestone

Continue Render removal in small verified steps.

Recommended next sequence:

1. **Remove normal page hydration dependence on legacy server sessions.** Make the License Admin page render a browser-auth shell by default; keep only the minimum explicit emergency/bootstrap server fallback.
2. Remove obsolete normal named-admin legacy session/adoption/password/MFA server paths once code search proves nothing still depends on them.
3. Move normal logout fully client/Cloudflare-native; keep emergency logout isolated to emergency mode only.
4. Design/migrate first-admin bootstrap without exposing a service-role/secret key or unrestricted Auth admin capability to the browser/Worker.
5. Re-evaluate emergency break-glass design for Cloudflare/self-host portability.
6. Verify a Cloudflare-compatible License Admin UI deployment path, then move UI hosting.
7. Only after all above paths are verified, remove Render configuration/service.
8. Start Global Core audit + self-service Subscription/Entitlements foundation.
9. Then Local-first Sync v2 / multi-branch correctness and formal Vyapar-parity gap audit.
10. Establish Minarva Intelligence platform foundation before large-scale AI feature rollout.

## 16. Small-milestone rule

Do not try to build the entire master plan at once.

Each milestone must be independently reviewable and mergeable. The user explicitly prefers small milestones because long chats can be interrupted.

If a chat ends, the next chat must continue from live repository state and these documents, not reconstruct the project from memory.
