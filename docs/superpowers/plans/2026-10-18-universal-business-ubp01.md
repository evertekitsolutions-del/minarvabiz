# Minarva Biz — UBP-01 Business Preset Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement one tested, stable catalog of all 100 owner-specified business types and safe, tenant-scoped presentation-only capability resolution without changing financial records, login authority, billing routes or production schema.

**Architecture:** Extend the existing `packages/types/src/universal-business-profile.ts` foundation from PR #478. Store the 100 industry presets in a separate, immutable, versioned data module. Normalize and validate verified organization business profiles in a pure boundary helper; a missing legacy profile preserves the current UI, and unknown/forged scopes fail closed. Wire shared public exports and GitHub CI; **do not activate dynamic POS or persist tenant choices in this batch**.

**Tech Stack:** TypeScript 5.7, Node 24 (`--experimental-strip-types`), pnpm 9.15.0, existing Next.js 15 + Electron monorepo, GitHub Actions CI.

**Spec:** `docs/superpowers/specs/2026-10-18-universal-business-platform-design.md` (owner-approved 2026-10-18). This plan executes only UBP-01, not the entire multi-subsystem specification.

**Repo baseline:** `evertekitsolutions-del/minarvabiz`; PR #478 `feat/universal-business-profile-foundation`, originally branched from `e7a44e378bc31523c1c547c6904d41d079bd8d0a`. Before implementation, check current `main`, PR and CI for intervening merges and avoid re-applying merged changes. Existing `packages/types/src/universal-business-profile.ts` provides the five groups, existing `BusinessCapability` union, `BusinessProfile`, default group capabilities and `parseBusinessGroup`; **reuse and extend**, do not recreate.

## Global Constraints

- No extra companies, items, invoices, payments, journal or inventory master tables; existing `organizations`, `products`, `sales`, `sale_items`, `payments` and `journal_entries` remain authoritative.
- Existing web POS, normal billing, Windows offline SQLite, license/subscription behavior, printing, data migrations and accounting remain **unchanged** in UBP-01.
- Exactly 100 business presets with stable, case-sensitive machine IDs and codes, grouped by owner ranges: RETAIL 001–030 (30); EXPIRE_BASED 031–045 (15); SERIALIZED 046–060 (15); DIMENSIONAL 061–080 (20); SERVICE 081–100 (20).
- `BusinessGroup` is one primary **presentation group**; `BusinessCapability` is additive. Only validated explicit add-ons can be displayed; presentation capability is not permission.
- Existing users have no `business_group` cloud column at this baseline. Missing profile returns **legacy** display mode and never forces a group; do not add org-column reads or dynamic route change before UBP-02.
- Never use browser-supplied `orgId` / renderer claims / editable `user_metadata` as the authorization source. Online scope must eventually come from existing `resolveOnlineAuthorization()` in `apps/web/src/lib/data-source.ts`. Device trust stays in the existing desktop main-process boundary.
- Reject invalid group names, unknown codes, unexpected capabilities, tenant mismatch and malformed arrays. Don't silently enable functionality on malformed inputs.
- No production SQL, server RPC mutation, deployment of experimental pages, paid infrastructure or paid AI in this plan. First 25 paying customers: review checkpoint only.
- Test first: RED (expected missing implementation) → GREEN (same test) → broader tests/typecheck → commit. Prefer short, isolated commits, one reviewable PR.
- Do not merge PR #478 based on stale CI runs: check the **new HEAD SHA** and all mandatory checks before merge.

## Review Focus

1. **Tenant switch during hydration:** input `org.id` mismatches the server-verified organization → reject before returning any business features; tested in Task 3.
2. **Unknown/malicious group or capability:** malformed strings or add-on arrays must throw, not unlock screens; tested in Task 2 and Task 3.
3. **Legacy tenant without profile:** must remain in current neutral POS/dashboard mode with no invented `RETAIL` upgrade; tested in Task 3.
4. **Hybrid business:** CCTV (054) needs serialized defaults plus optional booking; service repair (084/085) requires serial/barcode add-ons only when permitted; tested in Task 1 and Task 3.
5. **Entitlement mismatch:** UI capabilities intersect verified enabled add-ons, plan and role allowed lists; unknown fields and duplicates do not grant capabilities; tested in Task 3. This does **not** replace backend enforcement.

---

## Existing files, new files and interfaces

| Path | Responsibility |
| --- | --- |
| `packages/types/src/universal-business-profile.ts` | Existing five-group types/defaults; add pure presentation resolver in Task 3 |
| `packages/types/src/business-presets.ts` | Create: frozen, versioned, deterministic 100-business preset catalog and lookups |
| `packages/types/src/__tests__/business-presets.test.mjs` | Create: real import/assertions for 100 preset IDs, mapping, immutability and hybrid examples |
| `packages/types/src/__tests__/business-presentation.test.mjs` | Create: real import/assertions for profile parsing, tenant mismatch, legacy and entitlement intersection |
| `packages/types/src/index.ts` | Add re-exports only; existing types untouched |
| `packages/types/src/__tests__/business-exports.test.mjs` | Create: cross-package public export presence and behavior |
| `.github/workflows/ci.yml` | Run focused behavior tests after dependency install and before the build |
| `docs/UNIVERSAL_BUSINESS_100_TYPES_ARCHITECTURE.md` | Update delivery status; do not claim DB, routing or journals live |

**Interfaces across Tasks:**

```ts
// packages/types/src/business-presets.ts
export interface BusinessPreset {
  readonly id: string;                   // zero-padded "001"..."100"
  readonly code: string;                 // stable: "retail_001", "expire_based_031", etc.
  readonly name: string;                 // owner-approved English display title
  readonly businessGroup: BusinessGroup;
  readonly defaultAddons: readonly BusinessCapability[];
}
export const BUSINESS_PRESET_VERSION: 1;
export const BUSINESS_PRESETS: readonly BusinessPreset[];
export function getBusinessPresetById(id: string): BusinessPreset | undefined;
export function getBusinessPresetByCode(code: string): BusinessPreset | undefined;

// packages/types/src/universal-business-profile.ts
export type BusinessUIProfile =
  | Readonly<{ mode: "legacy"; orgId: string; businessGroup: null; enabledCapabilities: readonly [] }>
  | Readonly<{ mode: "configured"; orgId: string; businessGroup: BusinessGroup;
               presetCode: string; enabledCapabilities: readonly BusinessCapability[] }>;

export interface VerifiedPresentationContext {
  readonly verifiedOrgId: string;       // from existing auth/device verified boundary
  readonly orgRecord: unknown;          // org row read under verified scope
  readonly allowedByLicense: readonly BusinessCapability[];
  readonly allowedByRole: readonly BusinessCapability[];
}

export function resolveBusinessUIProfile(context: VerifiedPresentationContext): BusinessUIProfile;
```

Function semantics:
- `verifiedOrgId` must be non-empty and supplied only by the existing authenticated organization/device authority. Pure function checks consistency; **it cannot cryptographically verify the caller**.
- `orgRecord` must be a plain record with `id` identical to `verifiedOrgId`. Mismatch or missing record → throw `Untrusted business profile scope`. For a valid record missing both `business_group` and `business_type_code`, return `mode:"legacy"` (no capabilities; current UI stays intact).
- If configured, require exact `business_group` from `BUSINESS_GROUPS`, exact stable `business_type_code` existing in registry, and group agreeing with the preset. Any corruption → throw `Invalid business profile`. Accept optional `feature_config` as an object with `additionalCapabilities?: string[]`; reject other types, unknown capability strings, duplicates, and unknown top-level keys. No arbitrary user-controlled feature code.
- The canonical intended set is group defaults + preset defaultAddons + explicit adminEnabled add-ons, then **intersect** with both `allowedByLicense` and `allowedByRole`. Output array ordered by canonical `["barcode","expiry","serial","dimension","booking"]` with no duplicates. If either entitlement list is absent/malformed → throw, not all-access. Existing unconfigured orgs remain legacy regardless of plan.
- Caller must verify tenant membership, user/branch permissions, license entitlements and device authority *before* constructing context; this function is **presentation-only** and must not be called to authorize a write.

### Task 1: Immutable 100-business registry

**Files**
- Create: `packages/types/src/__tests__/business-presets.test.mjs`
- Create: `packages/types/src/business-presets.ts`
- Reference: approved spec section 4 and group range table

**Interfaces:** Produces `BUSINESS_PRESET_VERSION`, `BUSINESS_PRESETS`, lookup by ID/code; consumes `BusinessGroup`, `BusinessCapability` from existing profile module.

- [ ] **Step 1: Write the failing behavioral test.** Assert actual imports, `BUSINESS_PRESETS.length === 100`, `BUSINESS_PRESET_VERSION === 1`, 100 distinct IDs/codes, numeric IDs exactly `001..100`, lower-case code exactly `\${businessGroup.toLowerCase()}_\${id}`, and counts `{ RETAIL:30, EXPIRE_BASED:15, SERIALIZED:15, DIMENSIONAL:20, SERVICE:20 }`. Assert anchors: 001 FMCG/Kirana, 031 Pharmacy, 046 Mobile/Gadgets, 054 CCTV/Security, 061 Hardware/Power Tools, 074 Photo Framing, 081 Hair Salon, 084 Mobile Repair, 085 Computer/Laptop Repair, 100 Bicycle/E-Bike Repair. Assert `getBusinessPresetByCode("serialized_054")` has `defaultAddons: ["booking"]`; `getBusinessPresetByCode("service_085")` has `defaultAddons: ["barcode","serial"]` (exact order chosen in data module). Unknown ID/code must return `undefined`. Assert `Object.isFrozen(BUSINESS_PRESETS)`, each entry and addon array; mutation cannot alter lookup output.
- [ ] **Step 2: Run RED:** `node --experimental-strip-types packages/types/src/__tests__/business-presets.test.mjs`. Expected nonzero exit: module `../business-presets.ts` unavailable (or its missing exported symbol).
- [ ] **Step 3: Implement minimal catalog:** Copy exactly the 100 numbered names from spec section 4 into explicit ordered entries. `id` is 3-digit string; derive stable `code` by enum lowercase + `_` + ID (not display text). Freeze entries/addon arrays and canonical list. Use immutable module-level maps for lookup (no runtime mutable global registry). For other hybrid defaults keep minimal until approved: serialized_055 → booking, service_084 → barcode+serial; **no additional regulated entitlement auto-granted**. Refuse unknown group in registry construction.
- [ ] **Step 4: Run GREEN:** same focused test. Expect 0 failures and process exit 0.
- [ ] **Step 5: Run `pnpm --filter @minarvabiz/types typecheck`** after dependencies are installed; must exit 0.
- [ ] **Step 6: Commit:** `git add packages/types/src/business-presets.ts packages/types/src/__tests__/business-presets.test.mjs && git commit -m "UBP-01: register 100 stable business presets"`.

### Task 2: Fail-closed group/capability parser and default validation

**Files**
- Modify: `packages/types/src/universal-business-profile.ts`
- Create or extend: `packages/types/src/__tests__/business-presentation.test.mjs`

**Interfaces:** Consumes `BusinessGroup`, `BusinessCapability`, `resolveBusinessCapabilities()`, `parseBusinessGroup()`; produces reusable `parseBusinessCapabilities(value: unknown): readonly BusinessCapability[]` and extends strict parsing without widening the five enum groups.

- [ ] **Step 1: Write a RED test** that imports `parseBusinessCapabilities`, validates each of the five known identifiers exactly and rejects `null`, `["serial","unknown"]`, `"serial"`, `["serial","serial"]`, `["__proto__"]` and numeric entries. Assert `parseBusinessGroup("SERVICE")` succeeds; `"service"`, `"OTHER"`, empty object and empty string reject. Existing `resolveBusinessCapabilities("SERVICE")` remains booking-only, `EXPIRE_BASED` remains barcode+expiry; supplied group prototype tricks cannot pass.
- [ ] **Step 2: Run RED:** `node --experimental-strip-types packages/types/src/__tests__/business-presentation.test.mjs`. Expected nonzero exit because `parseBusinessCapabilities` does not exist.
- [ ] **Step 3: Implement minimal exact-list parser** in `universal-business-profile.ts`, returning a frozen/copy-on-return array; preserve existing public API and default semantics.
- [ ] **Step 4: Run GREEN** same test; expect exit 0, no warnings/errors.
- [ ] **Step 5: Re-run Task 1 tests** and `pnpm --filter @minarvabiz/types typecheck`.
- [ ] **Step 6: Commit:** `git add packages/types/src/universal-business-profile.ts packages/types/src/__tests__/business-presentation.test.mjs && git commit -m "UBP-01: reject invalid dynamic capability payloads"`.

### Task 3: Verified-tenant presentation composition and legacy fallback

**Files**
- Modify: `packages/types/src/universal-business-profile.ts`
- Modify: `packages/types/src/__tests__/business-presentation.test.mjs`
- Consume: `packages/types/src/business-presets.ts`

**Interfaces:** Produces `BusinessUIProfile`, `VerifiedPresentationContext` and `resolveBusinessUIProfile(context)` with **exact semantics above**, not a second authorization model.

- [ ] **Step 1: Add failing table-driven behavioral cases** for:
  - legacy `{id:"tenant-a"}` and verified tenant `"tenant-a"` → `mode:"legacy"`, group null, no enabledCapabilities;
  - configured `{id:"tenant-a",business_group:"SERIALIZED",business_type_code:"serialized_054",feature_config:{additionalCapabilities:["booking"]}}` with license+role lists `["barcode","serial","booking"]` → `["barcode","serial","booking"]` in canonical order, businessGroup SERIALIZED, presetCode retained;
  - identical row with license `["barcode","serial"]` → booking omitted, even though group/preset requested it;
  - service_085 with entitlement for booking and barcode but not serial → `["barcode","booking"]` canonical order;
  - row `{id:"tenant-b"}` with authorized tenant `tenant-a` → throws `Untrusted business profile scope`, not a successful legacy response;
  - unknown preset, mismatched preset/group, malicious additionalCapabilities (unknown string, duplicate, wrong shape), bad entitlement arrays, partial configured row, `orgRecord:null` → fail closed.
  - property-only attack: bogus `verifiedOrgId:""` rejects; `orgRecord` with `__proto__`-like string does not grant features.
- [ ] **Step 2: Run RED:** `node --experimental-strip-types packages/types/src/__tests__/business-presentation.test.mjs`. Expected nonzero exit due to missing `resolveBusinessUIProfile`.
- [ ] **Step 3: Implement minimal pure resolver**; check exact org-scope equality first; require plain record and valid allowed-by-license/role arrays; parse group, preset and feature config; select add-ons; deduplicate and canonical sort; construct frozen output. For legacy, never insert a guessed `RETAIL` group. Do not call database or depend on renderer/user metadata.
- [ ] **Step 4: Run GREEN:** same behavioral test; expect 0 failures.
- [ ] **Step 5: Run both focused tests and `pnpm --filter @minarvabiz/types typecheck`**; confirm no API regression to `parseBusinessGroup` or existing group defaults.
- [ ] **Step 6: Commit:** `git add packages/types/src/universal-business-profile.ts packages/types/src/__tests__/business-presentation.test.mjs && git commit -m "UBP-01: compose safe tenant-bound presentation profile"`.

### Task 4: Public exports, release gates and explicit unfinished scope

**Files**
- Modify: `packages/types/src/index.ts`
- Create: `packages/types/src/__tests__/business-exports.test.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/UNIVERSAL_BUSINESS_100_TYPES_ARCHITECTURE.md`

**Interfaces:** Export all UBP-01 types/functions from the existing `@minarvabiz/types` barrel. No UI route or DDL modifications.

- [ ] **Step 1: Write RED exports smoke:** import from `../index.ts` and assert `BUSINESS_PRESETS.length === 100`; `getBusinessPresetById("054")?.code === "serialized_054"`; `resolveBusinessUIProfile` legacy result for a safe input. Verify old `RoleName`/other type exports remain discoverable with `pnpm --filter @minarvabiz/types typecheck`.
- [ ] **Step 2: Run RED:** `node --experimental-strip-types packages/types/src/__tests__/business-exports.test.mjs`; expected missing export, exit nonzero.
- [ ] **Step 3: Add explicit barrel exports** (reuse module paths, do not duplicate group type definitions). Keep node test ESM-compatible; do not force type-only exports into runtime.
- [ ] **Step 4: Run GREEN**, all three tests and package typecheck:
  ```bash
  node --experimental-strip-types packages/types/src/__tests__/business-presets.test.mjs
  node --experimental-strip-types packages/types/src/__tests__/business-presentation.test.mjs
  node --experimental-strip-types packages/types/src/__tests__/business-exports.test.mjs
  pnpm --filter @minarvabiz/types typecheck
  ```
  Expected exit 0 for each, with no missing exports.
- [ ] **Step 5: Add these commands to the existing `web` CI job** immediately after `setup-node`/install and before full build; do not add new paid agents or disable any old checks. Add a small contract assertion that existing `apps/web/src/app/(app)/sales/page.tsx` and `PosBilling.tsx` do **not** import UBP-01 as a checkout authority. Update the architecture document status with explicit UBP-01 implemented-but-not-shipped wording; UBP-02 schema, UBP-06 UI and UBP-07 journal remain not implemented.
- [ ] **Step 6: Run full relevant test suite** (repo root existing `pnpm test` if defined; otherwise existing CI `web`, `tenant-sync-integration`, `desktop`, `licensing`, `windows-deep-smoke` and `feature-click-smoke` after PR); name any skipped jobs as skipped, not green.
- [ ] **Step 7: Commit and PR:** `git add packages/types/src/index.ts packages/types/src/__tests__/business-exports.test.mjs .github/workflows/ci.yml docs/UNIVERSAL_BUSINESS_100_TYPES_ARCHITECTURE.md && git commit -m "UBP-01: export profile contract and gate CI"`. Push isolated branch / amend PR #478 only if its purpose remains UBP-01; otherwise create a successor PR from current main after PR #478 merges. No speculative deployment claims.

## UBP-01 acceptance and merge requirements

- Exact preset counts and deterministic IDs verified; no missing/duplicated business group.
- Unknown, malformed and unauthorized group/capability inputs tested fail closed; multi-capability presets work within trusted license and role intersection.
- Existing tenant without new DB fields retains legacy UX; **no auth, RLS, online sale/financial, SQLite sync, payment or UI routes changed**.
- All three new tests explicitly observed RED→GREEN, package typecheck 0 errors; all mandatory PR CI checks pass at the final **HEAD SHA** before merge.
- Architecture/spec/roadmap docs state which features are not implemented, no “100 business types live” or “universal checkout launched” claim.
- Merging/deploying is a separate verified action. Windows release v1.0.15 must remain available; unrelated Minarva Technologies website/domain untouched.

## Ordered successor plans (do NOT implement under this UBP-01 plan)

The specification describes multiple independently reviewable subsystems; each gets its own `docs/superpowers/plans/...` plan, a testable PR, and a merge gate. Avoid bundling these into one unreviewable schema/checkout change.

| Next plan | Boundary / likely files | Non-negotiable test gates |
| --- | --- | --- |
| **UBP-02 Schema** | New ordered additive PostgreSQL migration(s), `supabase/MIGRATION_ORDER.txt`, `packages/database/src/sql/sqlite-ddl.ts`, `apps/web/src/lib/data-source.ts` | Live-vs-fresh schema drift, tenant RLS, legacy default, composite org FK, reversible offline compatibility |
| **UBP-03 Inventory units** | `packages/business-logic/src/store.ts`, product UI, inventory batch/serial tables, `packages/sync/src/supabase-adapter.ts` | Expired lot cannot sell; serial double-sell race, FEFO, warranty/reversal, tenant leak |
| **UBP-04 Scheduling** | `packages/business-logic/src/appointments.ts`, new booking persistence + desktop parity | Confirmed overlaps rejected across users; timezone/DST, cancellation, offline conflict |
| **UBP-05 Measurements** | `packages/business-logic/src/sales.ts`, `packages/types/src/index.ts`, sale item metadata and editor | Decimal/unit conversion, price rounding, fraction stock, GST, preview versus posted amount |
| **UBP-06 Dynamic POS & dashboard** | `packages/ui/src/components/sales/PosBilling.tsx`, five focused row-editor components, `apps/web/src/app/(app)/sales/page.tsx`, dashboard | Verified profile, no cross-tenant stale state, mixed lines, accessibility/mobile and scanner focus |
| **UBP-07 Atomic sales/journal** | Existing `public.create_sale` RPC, `packages/business-logic/src/sales-accounting.ts`, `packages/business-logic/src/accounting-store.ts` | One SQL transaction, balanced lines, exact currency, idempotent retry, concurrent checkout, full rollback |
| **UBP-08 Offline authority** | `apps/desktop/src/lib/sqlite-bootstrap.ts`, `packages/database/src/adapters/sqlite-domain.ts`, `packages/sync/src/supabase-adapter.ts`, `packages/business-logic/src/outbox-bridge.ts` | Device grant/revocation, offline restart, replay, booking/serial conflicts, staged restore, no silent auto-merge |
| **UBP-09 Pilot rollout** | Business onboarding and guided first-customer UI, support/docs, feature gates | Representative workflow per preset, branch/role tests, regulatory warning, owner sign-off |

**Cross-plan dependency:** UBP-01 → UBP-02 → UBP-03/04/05 → UBP-06 → UBP-07 → UBP-08 → UBP-09. UBP-03/04/05 may develop separately in test branches after UBP-02; shared checkout mutations must be integrated only after the UBP-07 atomic authority is ready. No percentage increase is asserted from an unmerged documentation/registry PR.

## Execution handoff

Owner approved the **architecture and written spec**, but has **not yet reviewed this plan**. The owner has previously preferred direct/native implementation rather than extra experimental agents. After owner confirms the plan, follow `superpowers:executing-plans` with an isolated branch/worktree and the TDD gates above. Do not treat previous spec approval as this plan's approval.
