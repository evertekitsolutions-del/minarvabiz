# Minarva Biz — Instructions for coding agents

## Mission and source of truth
- Implement the existing **full** Minarva Biz master vision without silently removing capabilities. Customer-facing Windows Offline, browser Online and Windows + Online Hybrid must share correct business logic; a mobile-accessible experience is also in scope.
- Start each task by verifying the **live** `main` SHA, open PRs, issue #325 and current GitHub checks. Never assume an old conversation's branch, SHA, CI status or progress estimate is current.
- Read and honor `PROJECT_CONTINUATION.md`, `docs/MASTER_PRODUCT_PLAN.md`, `docs/CAPABILITY_REGISTRY.md`, `docs/AI_CAPABILITY_REGISTRY.md`, `docs/PRODUCT_DELIVERY_BACKLOG.json`, `docs/DELIVERY_ACCELERATION_POLICY.md`, `docs/ENGINEERING_REUSE_POLICY.md` and `docs/MULTI_MODEL_REVIEW_GOVERNANCE.md`.
- The project-wide historical ~51% estimate is **provisional**. Only record customer-accepted outcomes with documented CI, UAT, deployment/release and review evidence. Source-only changes and an active PR are not commercial acceptance.

## Priorities and sequencing
1. Finish/review existing relevant open PRs before duplicating their code. Prioritize `A-FIRST-CUSTOMER` (onboarding, opening balances, inventory, sale/return, print, backup/restore, update, support, customer-usable release).
2. Next prioritize `A-SYNC-V2` (authorized cross-device offline replay, idempotency, branches/warehouses, conflict reconciliation and recoverability), then `A-LICENSE-CUTOVER` (licensed, provider-neutral commercial operation without mandatory Render). Follow `docs/PRODUCT_DELIVERY_BACKLOG.json` for later outcomes.
3. Use one coherent, independently testable business-journey milestone per PR. Preserve earlier behavior; diagnose root cause and add regression coverage. Do not repeatedly audit instead of shipping fixes.

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
