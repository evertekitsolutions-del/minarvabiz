## HR-005 Web holiday integration checkpoint — pending exact-head source verification

PR #335 and #336 are merged (source baseline `571c0117a8134ab45519baa5ed030082eaae9655`). New Web console adds feature-flagged authenticated holiday manager, scoped save/list, optimistic revision, read-only roster exception preview. Production holiday SQL migration **not** applied; customer UAT and Windows Offline/Hybrid parity missing. Keep `NEXT_PUBLIC_HR005_HOLIDAYS_READY` OFF until controlled database rollout. Live source CI/results supersede this provisional checkpoint. Full Master Vision ~51%.

# Minarva Biz — Durable Development Continuity

**Purpose:** A GitHub-backed recovery/checkpoint mechanism for chat interruptions, not a replacement for human or AI implementation.

## Single source of truth and what persists

- `PROJECT_CONTINUATION.md`: verified project history, source versus production deployment boundaries.
- `docs/DEVELOPMENT_TASK_QUEUE.json`: ordered task IDs, status, next work, minimum feature acceptance and references. Only change a task to `verified` after required tests, release/product acceptance and documented evidence. A PR or green CI alone does not prove full Master Vision completion.
- `Minarva Biz — Development Continuity Dashboard` GitHub Issue: machine-updated snapshots of current main SHA, open PR numbers, observed latest-main checks, latest GitHub release tag, next unblocked task and all queued tasks.
- `.github/workflows/automated-ci-triage.yml`: existing failed PR issue reporter retained; the new protected `continuity` job fetches **data only** from GitHub. It never checks out/executes PR code with the write-scoped token.

## Operation

After completion of an eligible main push CI/Windows check, or the daily no-new-commits safety refresh, the continuity job updates the **same** GitHub Issue. Concurrency is serialized for main so overlapping workflow completions do not create duplicate issues. A manually closed dashboard is respected and not reopened or silently duplicated. Failures in the read/API path fail visibly and can be retried on the next eligible main CI/refresh; the previous checkpoint remains.

On chat interruption:

1. Verify live `main`, open PRs/issues and all exact-head/required checks, not the SHA from the chat.
2. Read `PROJECT_CONTINUATION.md`, `docs/MASTER_PRODUCT_PLAN.md`, `docs/CAPABILITY_REGISTRY.md`, `docs/AI_CAPABILITY_REGISTRY.md`, `docs/ENGINEERING_REUSE_POLICY.md`, `docs/MULTI_MODEL_REVIEW_GOVERNANCE.md` and this queue file.
3. Finish any open feature PR first: inspect failed logs, fix the root cause, rerun checks, merge only when required gates are green, then verify post-merge.
4. Do not edit live migrations, invoke external AI, choose paid services or issue customer approvals automatically. Keep branch/tenant, Offline/Online/Hybrid, history, security, audit, compatibility and genuine customer UAT gates in place.
5. Only mark a feature `verified` and update the **whole-product progress estimate** after recorded acceptance evidence. Feature slices and passing smoke tests do not warrant fabricated increases.
6. Search current Minarva code and license-compatible mature OSS before writing substantial custom code.

## Security and cost model

The workflow has existing read permissions plus `issues:write`; it cannot write source code or deployment secrets. GitHub's built-in token is ephemeral. Dashboard content is **public** because the source repository is public; never place credentials, customer data or private incident logs in queue text or issue comments. No external model/API or paid dependency has been added.

GitHub Actions execution still consumes any applicable GitHub runner quota. The daily refresh is low-frequency, not an unlimited-work guarantee. There is **no autonomous coding model installed**: without an independently running authorized agent, no new feature implementation happens while ChatGPT is disconnected. The dashboard preserves the next work and failure status so the next session can resume without recreating the plan.

## Acceptance evidence

`node scripts/development-continuity-contract-smoke.mjs` verifies task IDs, priorities and acceptance references; privileged-workflow branch/repository guards; no checkout or automation of merges; bash syntax; create/update of a single dashboard issue; failed main check surfacing; respect of a human-closed issue. This regression runs in existing main/PR CI. Existing Web, Windows, security, supply-chain and licensing checks remain mandatory.

The newest verified source milestone is PR #333, same-origin Web Locks for explicit local-only reviewed restore, merged at `a33c934fa018a81beef0f6a2b604dbe83d40ed2c` with 25 passed / 5 optional skipped / 0 failed or pending main checks. Earlier PR #332 added human-only deterministic HR-004B multi-ID review ordering. HR-004C policy lifecycle PR #326 and its production migration were previously verified, but flag rollout and authenticated UAT remain pending. Neither milestone shipped a newer customer installer or completed HR recovery/scheduling. Full Master Vision estimate remains approximately **51%**. Read the live task queue for acceptance blockers.
