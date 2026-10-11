# Minarva Biz — Local Ollama + OpenCode development workflow

**Status:** Optional, free local development helper. This is NOT an autonomous hosted coding agent, replacement for CI, or approval to alter production.
**Last verified main before documentation:** `0a98f29b7e2c8c633b82de7835f1b990afaa41ba` (#326 merged).
**Project:** `evertekitsolutions-del/minarvabiz`; full Master Vision estimate ~51%. Stable released Windows installer v1.0.15.
**Authoritative work queue:** `docs/DEVELOPMENT_TASK_QUEUE.json`, plus Issue #325 and `PROJECT_CONTINUATION.md`.

## Architecture and cost boundaries

- Ollama runs an open-weights model locally at `http://127.0.0.1:11434`.
- OpenCode is an interactive coding agent using that model to inspect and propose repository changes. A plain Ollama install alone does NOT perform GitHub coding in the background.
- Developer must run OpenCode on their Windows/WSL computer and provide an existing authorized GitHub checkout; GitHub-hosted runners cannot reach the user's localhost model.
- Model downloads and local inference do not require a paid remote inference API, but disk, RAM/VRAM, electricity and network bandwidth are consumed.
- NEVER expose the local API to the public Internet or add GitHub/secrets/production database credentials to an AI prompt, config file or issue.
- Do not connect a coding agent to a production database or customer data. Local agents may draft SQL/test cases, but controlled migration tools and independent evidence are mandatory for production.
- Ollama is separate from the application's customer-facing AI. This local developer setup does not ship Ollama inside Minarva Biz.

## Verified references

- Ollama official Qwen2.5 Coder model library: https://ollama.com/library/qwen2.5-coder
- Ollama's model page documents `ollama launch opencode --model qwen2.5-coder`.
- OpenCode official local-provider documentation: https://docs.opencode.ai/docs/providers/
- OpenCode Windows/WSL installation: https://docs.opencode.ai/docs/
- Review local model license and tool-use compatibility before depending on it for a commercial runtime; model inference here is for the developer only.

## Windows operator setup

1. Verify Ollama is installed: run `ollama --version`, `ollama list`.
2. Choose **one** model based on real RAM/VRAM and performance:
   - 8 GB system RAM: experiment with `ollama pull qwen2.5-coder:3b` (~1.9 GB model, limited agent reliability).
   - 16 GB RAM: try `ollama pull qwen2.5-coder:7b` (~4.7 GB model).
   - 32 GB+ RAM: experiment with `ollama pull qwen2.5-coder:14b` (~9 GB model).
   - File/download size is not required operating RAM; longer context, simultaneous tools and OS load need headroom.
3. Install OpenCode if absent, following official Windows/WSL docs. At the Ollama Apps screen choose **OpenCode**, or launch with `ollama launch opencode --model qwen2.5-coder:7b` (adjust actual installed model tag).
4. Ensure Git and Node/pnpm dependencies are separately installed. Clone existing repository into a new **local working copy** only if it is not on disk already. Cloning never creates a new GitHub project.
5. Review `git status`, `git branch --show-current`, `git rev-parse HEAD`; preserve any local changes; verify live remote main before switching or pulling. Work only on a new task-specific branch from clean/current main.
6. Agent starts read-only: inspect Issue #325, task queue, continuation, Master Product Plan, Capability Registry, AI Registry, Engineering Reuse Policy and governance docs; identify exact next unfinished acceptance. Never restart merged HR-002/HR-004 milestones.
7. Developer explicitly approves bounded file edits and permitted test commands. Small task -> reused code/license review -> tests -> human diff review -> PR. Never grant unattended push to main, PR merge, deployment, destructive DB migration or Windows customer release.
8. Mandatory exact-head GitHub CI plus post-merge verification remains unchanged. If a local model stalls, hallucinates APIs or omits security requirements, stop local changes and return to review. Do not lower acceptance thresholds.
9. Do not claim automatic progress while PC/agent is off. To continue after disconnection, commit checkpoint on its branch and update the GitHub continuation/task record through reviewed PR.

## Example limited-scope first agent task

**Mode:** inspect-only until authorized. Prompt:

> Continue existing Minarva Biz repository, never restart. Verify live main and Issue #325. Read PROJECT_CONTINUATION.md, docs/DEVELOPMENT_TASK_QUEUE.json, docs/DEVELOPMENT_CONTINUITY.md, docs/MASTER_PRODUCT_PLAN.md, docs/CAPABILITY_REGISTRY.md, docs/AI_CAPABILITY_REGISTRY.md, docs/ENGINEERING_REUSE_POLICY.md and docs/MULTI_MODEL_REVIEW_GOVERNANCE.md. Compare current task queue with merged PR #326 and live migration evidence. First report the smallest pending, independently testable HR-004C acceptance or HR-004B recovery task, existing code to reuse, anticipated security/Offline/Hybrid impact, target files, and exact tests. Do not edit files or run migrations yet. No paid services, no simplification, no unrelated changes. Full Master Vision stays ~51% until verified product-wide evidence.

The local agent is advisory until its branch, changes and tests are independently reviewed.

## Latest HR-004C factual handoff (Oct 11, 2026)

- PR #326 `feat(HR-004C): immutable reviewed-policy termination and effective-dated selection` merged as `0a98f29b7e2c8c633b82de7835f1b990afaa41ba`.
- Exact-head checks were 20 passed/2 optional skipped/0 failed. Post-merge main checks completed 25 passed/5 skipped/0 failed/pending, 0 open PRs.
- Supabase `wmjgefbaliuwmaxyzxkq`: migration history has `20261011054317 hr_roster_policy_resolution_selection`. Never reapply blindly. Read-only checked RLS and FORCE RLS on reviews/resolutions; authenticated SELECT but not direct INSERT/UPDATE/DELETE; RPCs privileged only to authenticated users (server checks administrator role); append-only/validation triggers exist. No production organizations, drafts or reviews at verification.
- `staff_roster_guard()` does not call candidate selector. New Web lifecycle UI is gated OFF unless `NEXT_PUBLIC_ROSTER_POLICY_LIFECYCLE_READY=true` is explicitly set after deployment verification; browser user acceptance must still occur.
- Remaining: verify production Web flag and actual authenticated administrator workflow (no fake customer UAT); Offline/Windows/Hybrid policy parity; server UTC/rest guard cutover with DST/cross-branch/historical testing; HR-004B different-ID multi-event crash recovery; future product readiness/release.
- Do not increment whole Master Vision estimate based solely on this documentation or isolated HR PR.
