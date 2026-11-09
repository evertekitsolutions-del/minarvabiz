# MINARVA BIZ — OWNER'S NON-NEGOTIABLE RULES
**Owner reaffirmation: 2026-11-08. Binding for all coding agents, reviewers, automations, releases, deployment work and future chats.**

This file is the project's first-read owner policy. In a conflict, obey the owner's latest explicit request, preserve already-recorded prohibitions, and ask only when changing an established prohibition is essential. Do not silently substitute the assistant's past plan.

## 1. Absolute project hosting prohibition

- **NO VERCEL. NO RENDER.** Minarva Biz customer website, Online application, Hybrid endpoints, License Admin, marketing website and customer runtime **must not be built, deployed, hosted, promoted or reconnected to Vercel or Render**. Do not create previews or production deployments, redeploy Git-integrated projects, or use Vercel/Render tools for this project. The owner's prior removal decision is final unless the owner personally reverses it in an explicit newer instruction.
- **Cloudflare is the approved current hosting/deployment platform**, using the already-connected owner's Cloudflare account and existing resources wherever safe; shared Supabase/PostgreSQL is allowed within the zero-cost policy. Use existing Workers/Pages/Static Assets as appropriate to current project configuration and signed-key authority, never guess domains or Cloudflare accounts.
- Ensure the system remains provider-neutral and fully portable to the owner's **own server** later: standard PostgreSQL/portable storage, replaceable API/storage adapters, migration/export, no irreversible vendor lock-in.
- Any legacy Vercel configuration, deployments, ignored builds, repo references and historical URLs are **migration evidence only**, not active targets. Do not remove a live dependency before Cloudflare replacement, authentication, DNS and end-to-end customer flows have been verified. Never claim Cloudflare cutover was completed without live evidence.
- Do not modify other unrelated projects merely because they historically use Vercel.

## 2. Product scope must never shrink

- The product is **the universal, modular Minarva Biz ERP/SaaS**, for all industries, not only boutique/laundry. Industry-specific boutique/tailoring/laundry capability is an integrated optional pack.
- Deliver **Windows Offline (Electron + SQLite), browser Online, truly bidirectional Hybrid, and phone/mobile-browser experience** with shared domain logic and authorized tenant/branch/company data, reliable local-first offline operation and safe reconnect.
- Supabase table existence or a deployed web page **is not proof of working cross-device synchronization**. Financial, stock and invoice events require durable outbox, server-authoritative idempotent commit, ordered reconciliation, verified RLS/roles, conflict handling and cross-device user acceptance. Do not enable unverified automatic financial replay.
- Implement every capability in `docs/CAPABILITY_REGISTRY.md`, `docs/AI_CAPABILITY_REGISTRY.md`, `docs/MASTER_PRODUCT_PLAN.md` and delivery backlog without silently dropping modules. Reuse audited permissive-license OSS (MIT Open Mercato preferred). Reject GPL/AGPL/unlicensed or restricted enterprise code.

## 3. Customer-data and update invariants

- **Customer database, backup, license, stock, product records, journal, registration and invoices are untouchable** without explicit informed approval. Never reset, uninstall, mass-replace, re-seed, or silently restore. New desktop product Save must await durable SQLite acknowledgment; update must flush pending writes and preserve verified internal + external pre-update backups.
- Keep automatic backup verification, frequent recovery checkpoints, visible failure states and corruption/hydration guards. Preserve existing customer backups/forensic evidence; never run schema migrations or destructive operations on production casually.
- Windows installation updates happen through the **existing in-app Dashboard `Update & restart`** with a signed verified manifest, SHA-256, backup, silent install and app relaunch. Do **not** ask customers to manually download/reinstall or require resetting their license. Never switch update/license signing authority without verifying older clients.
- No false claim that a source merge is a shipped/signed update. Separate (a) code merged, (b) installer signed/published/channel reachable, (c) customer's installed version updated and data verified.

## 4. Engineering/financial governance

- First 25 paying customers = review point, **not automatic spending permission**. No paid hosting, AI, external API, or recurring cloud infrastructure without explicit owner authorization.
- Build from live GitHub main, inspect existing PRs and #325/#735 and this policy first; do not rebuild merged work. Work on discrete feature branches; production migration, release, credential rotation and changes to licensed authority require explicit authorization. Independent review and exact-head green CI before merge.
- Keep working toward the entire Master Vision with urgent security/data-loss/regression blockers first; avoid unrelated hardening loops. No claimed completion percentage without audited capability-level evidence, installed/customer UAT and proof.
- Respectfully communicate in short **Malayalam**, no repeated user questions, no patronizing commentary. Give concrete GitHub PR/CI/deployment status, distinguish attempted vs verified actions; do not invent deployment success.

## 5. Mandatory agent preflight (before EACH run)

1. Read **this file and AGENTS.md**, latest owner's directives and project-specific decisions **before choosing tools or hosting**.
2. Explicitly check the project's exclusion list: **Minarva Biz: Vercel/Render forbidden; Cloudflare approved.** If planned actions include a prohibited provider, stop the plan and select the Cloudflare/self-hostable path instead.
3. Verify live GitHub main SHA, open PRs and mandatory CI; avoid affecting the customer's installed data.
4. For Hybrid/mobile work, audit authenticated tenant data sync and live Cloudflare web, not historical Vercel presence. No source-only completion claims.
5. If conflicting notes exist, prefer this newer explicit owner prohibition and document the source of any necessary change.

These instructions apply to every agent and every scheduled job; no schedule, tool recommendation, past conversation or historical repository note may silently override them.
