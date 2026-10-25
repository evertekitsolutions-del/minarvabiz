# Minarva Biz — Delivery-first execution policy (2026-10-12)

## Why the execution model changes

The live repository has more than a hundred merged source milestones, while the full Master Vision remained at an *unverified historical estimate* of approximately 51%. The previously authoritative HR-only engineering subqueue was not a representative product roadmap. Six consecutive Windows SQLite-hardening PRs (#350–#355) produced valuable data-safety protections, but not six separately accepted, customer-visible business modules. The stable published installer still is v1.0.15.

This plan keeps the **entire** agreed scope. It changes sequencing and evidence, not feature ambition or security gates. The same feature must eventually work with shared core, authorized Online/Offline/Hybrid behavior, tenant/branch boundaries, audit and portable infrastructure.

## Authoritative prioritized commercial outcomes

`docs/PRODUCT_DELIVERY_BACKLOG.json` is the top-level delivery scoreboard covering all phases A–F. It references all 18 business/control registry groups (329 capability IDs) and the entire AI registry (111 distinct AI IDs), plus industry packs and infrastructure outcomes. These are **requirements in scope, NOT delivery claims**.

The **former** first three priorities below are historical and are overridden for *development sequencing* by `docs/OWNER_DIRECTIVE_2026-10-20.md` (Q1–Q8, then Phase H). They remain in scope:

The former first three prioritized outcomes were:
1. `A-FIRST-CUSTOMER`: verifiable first-customer sales/stock/printing/backup/onboarding/update/support flow with released Windows app and Online/Offline/Hybrid UAT;
2. `A-SYNC-V2`: reliable branch/warehouse ownership, offline-first outbox, replay/conflict resolution and true multi-device recovery;
3. `A-LICENSE-CUTOVER`: commercial device entitlement and provider-neutral License Admin, without mandatory Render.

Next: self-service entitlements, country-neutral core, Vyapar-parity finance/inventory/procurement, provider-neutral AI, professional support/updater; then CRM/HR, integrated Commerce + Marketing, BI and every industry/country/ecosystem phase. Enabling a feature flag, reporting a read-only preview or merging code does not count as customer acceptance.

`docs/DEVELOPMENT_TASK_QUEUE.json` continues as a *technical subqueue*, including all ongoing HR work. It must not silently dictate the order of the entire product. When a serious verified security/data-loss blocker prevents a commercial outcome, describe the user-facing blocked journey and the minimal full-scope fix before diverting effort; do not enter an endless chain of unrelated optional hardening PRs.

## Evidence and reporting, without invented progress

Before an outcome can be marked `accepted`, record verifiable links for source PR, exact-head CI, postmerge CI, customer/business-flow UAT, release/deployment and reviewer; independent verification is still required. A source-only merge is `implementation in progress` until acceptance evidence exists. Do not classify an unreviewed capability as missing or completed. Always report:
- full Master Vision: historical ~51% **provisional**, not an exact percentage;
- acceptance outcomes: accepted with evidence vs not yet validated;
- readiness of customer release v1.0.15 vs source-only commits;
- agent actual coding state, not a green preflight check;
- next *customer-visible* acceptance blocker.

`node scripts/product-delivery-audit.mjs` checks that no registry groups, AI features or phases disappeared and rejects fabricated `accepted` items without mandatory documentation. No automatic percentage increase from number of PRs, lines of code or CI passes. A later approved weighted capability-level audit may replace the provisional 51%, but no weight or evidence is invented here.

## Engineering throughput without cutting quality

- Plan *one coherent business-journey milestone* per release track and keep its root-cause fixes/tests in that PR/related PR chain, instead of many unrelated micro-PRs.
- Reuse existing shared code, published official SDKs and compatible licensed open-source modules before custom implementation, with license/security/portability checks.
- Parallelize only independent tracks with stable shared contracts: Commercial release+UAT, Sync v2, and Commerce discovery can proceed independently; potentially destructive shared PostgreSQL migrations need serialized review.
- Keep a protected `main`. Each PR must pass exact-head CI and postmerge CI. Do not weaken real tests, skip release UAT, or issue a Windows customer release without signed installer checks.
- The first ~25 paying customers are an *infrastructure spending review checkpoint*, not a purchase authorization. No automatic recurring paid infrastructure or AI usage.

## Background coding agent: verified facts and choices

On 2026-10-12, the scheduled GitHub workflow had two observed `schedule` runs: both read-only `preflight` jobs passed; both `source_patch` coding jobs were **skipped**. The `MINARVA_COPILOT_AUTOCODE_ENABLED` value observed by the preflight was empty. No automatically generated source patches or PRs were verified. The existing workflow does **not** auto-push, create PRs, merge or continuously run code. A green scheduled job is therefore *not* a working coding agent.

The gate now reports `DISABLED_NO_CODING`, `BLOCKED_NO_CODING` or `REVIEW_PATCH_JOB_ELIGIBLE` rather than conflating readiness with actual changes. The last state still **does not prove** generated code. The workflow also validates entire roadmap scope at no inference cost.

**Updated owner decision (2026-10-12):** Local-computer inference and the earlier local coding-agent approach are abandoned and must not be proposed or reactivated. An hourly ChatGPT scheduled development attempt has been enabled for the EXISTING GitHub repository, subject to available GitHub access and per-run execution limits; this is not a persistent 24×7 server and a scheduled run does not itself prove code was written. The previous GitHub Copilot source_patch gate remains disabled pending explicit verified zero-cost entitlement and permission review. Source changes must be on dedicated branches with regression tests, exact-head CI and controlled merges; no paid AI or production writes.

The optional GitHub Copilot CLI source_patch step stays **disabled** unless the owner first verifies entitlement, possible charges and explicit opt-in. Turning it on by guessing billing status is unacceptable. There is currently **no verified always-on autonomous coder**; do not claim otherwise.

## Immediate next work — superseded by owner feature-first directive (2026-10-20)

1. Record `docs/OWNER_DIRECTIVE_2026-10-20.md`, update repo agent/backlog guidance and tighten the existing CI license gate; merge only after the required checks pass.
2. Start **Q1 A-CORE-PARITY**: verify live-main SAL-003 sales-order completeness, then implement the missing/partial coherent sales-order-to-invoice vertical slice (or record implementation evidence and move to SAL-007 if it already exists). Continue billing, finance, inventory and procurement Q1 IDs in owner queue order. Research Open Mercato at a pinned MIT commit before adapting any pure code.
3. Then Q2 global core/country tax packs; Q3 control plane; Q4 AI; Q5 growth; Q6 commerce/BI; Q7 verticals; Q8 integrations and owned infrastructure. Full ID queue and acceptance obligations: `docs/OWNER_DIRECTIVE_2026-10-20.md`.
4. **Phase H deferred**: additional `A-FIRST-CUSTOMER` and `A-SYNC-V2` optional hardening, cent-guards, backup/restore/release-gate polish, unrelated performance/security polishing and repeated audits. Add verified non-blocking findings to `docs/HARDENING_DEFERRED.md`. Preserve merged protections and only interrupt for the owner's three documented blocking exceptions. Never count a source PR as accepted or invent a percentage.
