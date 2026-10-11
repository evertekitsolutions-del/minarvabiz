# Minarva Biz — no-new-server GitHub source agent (controlled rollout)

**Scope:** existing `evertekitsolutions-del/minarvabiz`. This is a scheduled, checkpoint-based **source review patch generator**, **not** a persistent 24×7 machine or self-merging coding service.

## Initial state and zero-cost rule

- Every 30 minutes, `.github/workflows/minarva-source-agent.yml` runs the **read-only** queue/PR/exact-main gate. GitHub's schedule is best effort, not a guaranteed clock.
- **AI is OFF by default.** The repository Actions variable `MINARVA_COPILOT_AUTOCODE_ENABLED` must equal `true` before any Copilot request. The workflow does not auto-create the variable or any secrets.
- Before manually enabling it, the repository owner must confirm Copilot entitlement, billing/usage budgets and permitted model access. GitHub-hosted public-repository Actions minutes and inference credits are separate. GitHub Models inference was retired July 30, 2026; do not rely on it.
- No automatic API purchases, subscription upgrade, payment cards, VPS, production migrations, new database secrets, model-billing opt-ins or recurring paid infrastructure are performed. First ~25 paying customers is a review checkpoint, not approval to incur charges.
- GitHub Copilot CLI can use the ephemeral GitHub Actions `GITHUB_TOKEN` with `copilot-requests: write`, subject to user's GitHub seat, account policy and usage limits; GitHub Copilot costs may apply. No long-lived PAT is requested.

## Guardrails and task boundaries

1. Source repo and exact `main` SHA must be current. Wrong ref, stale checkout, invalid queue, missing/truncated PR list and any open PR targeting main halt AI work.
2. For first source rollout only `HR-005-HOLIDAYS` is allowlisted when marked `ready` or `in_progress`; blocked and verified tasks never run. The allowlist is intentionally code-reviewed, not inferred by an AI model.
3. Single scheduled workflow concurrency and no code push. Preflight token is `contents: read`. Separate AI job has only `contents: read` and `copilot-requests: write`.
4. Copilot receives no general shell, URL or GitHub write permission; it may edit checked-out source. Only reviewed source directories/extensions are accepted; no workflows, configs, schema migrations, secrets, payroll rules, production data or external commands.
5. Patch audit rejects zero edits, paths outside allowlist, deleted/renamed files, oversized/binary/sensitive patches or whitespace errors. Results are uploaded only as a short-retention GitHub Actions artifact; **no PR, automatic merge, deployment, updater, customer license action, production feature activation or Windows installer**.
6. A maintainer must inspect the patch, run tests, use a feature branch to propose an ordinary PR and allow existing CI/security gates to run before merging. Never bypass GitHub write/security restrictions.
7. Existing open PRs #343/#345 have priority. This gate will report `finish_open_pr_first` until the main-targeting PR backlog is cleared. It does not repair those PRs or claim they are done.

## How to inspect and, only after explicit cost verification, activate

Open GitHub repository **Actions** > **Minarva Source Agent — gated review patches** > **Run workflow**. Check the preflight reason and zero-cost result. The scheduled gate runs by itself once the workflow has landed on `main`.

Only after verifying actual Copilot usage/billing protection, go to **Settings → Secrets and variables → Actions → Variables** and explicitly create `MINARVA_COPILOT_AUTOCODE_ENABLED=true`. Leaving it absent or set to `false` keeps every AI invocation disabled. If usage/billing cannot be confirmed, **do not enable it**.

A successful opt-in run produces an Actions artifact `minarva-reviewed-source-proposal`. The artifact is not a merged feature. Inference errors/entitlement exhaustion fail the job rather than silently turning to a paid API or weakening checks.

## Tests

Run `node --test scripts/agent-queue-gate.test.mjs scripts/agent-patch-audit.test.mjs`.

Customer Windows installer stays **v1.0.15**. Full Master Vision remains approximately **51%** until independently verified wider acceptance.
