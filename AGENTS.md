# Minarva Biz — Instructions for coding agents

## Mission and source of truth
- Implement the existing **full** Minarva Biz master vision without silently removing capabilities. Customer-facing Windows Offline, browser Online and Windows + Online Hybrid must share correct business logic; a mobile-accessible experience is also in scope.
- Start each task by verifying the **live** `main` SHA, open PRs, issue #325 and current GitHub checks. Never assume an old conversation's branch, SHA, CI status or progress estimate is current.
- Read and honor `PROJECT_CONTINUATION.md`, `docs/MASTER_PRODUCT_PLAN.md`, `docs/CAPABILITY_REGISTRY.md`, `docs/AI_CAPABILITY_REGISTRY.md`, `docs/PRODUCT_DELIVERY_BACKLOG.json`, `docs/DELIVERY_ACCELERATION_POLICY.md`, `docs/ENGINEERING_REUSE_POLICY.md` and `docs/MULTI_MODEL_REVIEW_GOVERNANCE.md`.
- The project-wide historical ~51% estimate is **provisional**. Only record customer-accepted outcomes with documented CI, UAT, deployment/release and review evidence. Source-only changes and an active PR are not commercial acceptance.

## Priorities and sequencing — owner override effective 2026-10-20
1. Follow `docs/OWNER_DIRECTIVE_2026-10-20.md`: **complete missing/partial Master Vision capabilities first**. Start Q1 core billing/finance/inventory/procurement, then Q2 global core/tax, Q3 entitlements, Q4 AI, Q5 growth, Q6 commerce/BI, Q7 verticals, Q8 integrations. Verify every candidate against live main before writing code. Keep original scope and safety gates.
2. **Defer optional A-FIRST-CUSTOMER and A-SYNC-V2 hardening to Phase H**, without reverting prior fixes. Only interrupt for documented active-customer security/data-loss blockers, new-work regressions, or existing bugs directly blocking the current feature. Log all other findings in `docs/HARDENING_DEFERRED.md`, then continue shipping capabilities. A draft PR is not a reason to duplicate code.
3. Inspect Minarva shared code first; prefer selectively adapted, pinned MIT TypeScript pure functions from Open Mercato next. Aimeos LGPL and QUIQQER GPL/custom modules are **behaviour references only**. Follow `docs/OSS_MODULE_ADOPTION.md` and `docs/DEPENDENCY_REUSE_LOG.md`; require exact upstream license review.
4. One full-scope, independently testable vertical slice per PR, existing feature flag OFF for customer builds, changed-code coverage >=80%, exact-head green checks before merge. No audits or docs-only progress chains in place of features.

## Engineering boundaries
- Existing monorepo uses pnpm 9, TypeScript, Next.js web, Electron + SQLite desktop, shared business logic, sync package and Supabase PostgreSQL. Respect package boundaries and the existing offline-first outbox and authoritative permission model.
- Never generate duplicate sale/payment/stock/ledger effects on retries or reconnection. Preserve tenant, branch, device and warehouse authority, numerical/accounting invariants, crash safety and no partial durable writes.
- Review RLS and authorization for any cloud or financial write; never treat renderer-controlled fields as verified device enrollment/authority.
- Favor existing code and license-compatible audited OSS. Preserve portability/self-host path; Cloudflare/Supabase adapters must not become unavoidable hard-coded vendor contracts. Do not reintroduce Vercel/Render as mandatory runtime infrastructure.
- No recurring paid infrastructure or paid AI/inference without explicit approval. The first 25 paying customers are a cost-review checkpoint, **not** automatic spending authorization.
- Do not use real customer data, mutate production databases, apply hosted migrations, publish releases, rotate credentials or enable automatic financial writes without explicit owner approval. Do not print or commit secrets.

## Verification and handoff
- Check the actual package scripts before selecting commands. Root `pnpm test` or the business-logic package's placeholder `test` script is **not** sufficient proof of behavior; run existing targeted `node --test` suites, package typechecks and relevant build/integration gates.
- Open a dedicated branch and PR with: purpose, affected journeys, exact base/head SHAs, test command/result evidence, limitations, rollback plan and customer UAT blockers.
- Require exact-head mandatory GitHub checks and post-merge checks. Never call an incomplete/pending CI run green; do not bypass checks or merge drafts/known-unsafe changes.
- A merged source PR is not a published Windows installer, a deployed customer app or an accepted end-to-end journey. Clearly distinguish all three.
- Keep developer reports concise and evidence-backed, with direct PR/CI/customer-test links. Prefer implementing the next verified blocker rather than long speculative status reports.
