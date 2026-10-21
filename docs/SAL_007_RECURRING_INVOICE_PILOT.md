# SAL-007 — Recurring invoices (source-only pilot)

Status: **IN PROGRESS**, not commercially enabled, not accepted.

## This commit

- Deterministic daily/weekly/monthly/yearly invoice-draft scheduler in shared business logic.
- Anchor-day semantics (31st → February end → 31st), leap years, bounded intervals, cancellation and pause, optimistic revision check.
- Strict positive milli-unit product quantities; source invoice and customer references only. No cached invoice amounts or implicit taxation.
- Trusted tenant/company/branch callback required for SQLite pilot create, update, stage and list.
- Explicit, isolated SQLite tables with unique (schedule, sequence) and transaction rollback. Repeated staging does not create duplicate draft rows.
- Source-only PostgreSQL staging with FORCE RLS and **no authenticated/anon privileges or policy**. Merely adding this SQL file grants no online feature.
- Shared nonbinding checkout preview resolves current product selling price, discount, tax, stock and cost through a trusted host reader; rejects changed customer/branch/invalid source invoices and measured lines. It never calls `createSale`, computes no irreversible posting, and the commercial checkout must revalidate everything.
- The opt-in SQLite pilot now also has a **host-only manual post contract**: a trusted approver, a synchronous authoritative financial writer, a separate transaction-local invoice verifier, SQL write proof, a unique posted-invoice reference and CAS draft acknowledgement. Real SQLite tests exercise its all-or-nothing commit and rollback against an **isolated financial fixture**; this is not proof of production ledger integration.
- Shared Web/Desktop `RecurringInvoiceWorkspace` presenter plus a separate **trusted-process workflow coordinator** for source-derived schedule creation/listing, stage/review, pause/resume/cancel and optional verified manual post, **not mounted/enabled in customer apps**. Render is gated by a required `enabled` prop, and posting appears only after a verified live preview plus an explicit host posting callback. The privileged coordinator is deliberately absent from the public business-logic barrel and is exported only at `@minarvabiz/business-logic/recurring-invoice-workspace-host` for a future trusted Electron-main or server import. No hosted or commercial SQLite authority has been wired into the component.
- Node tests cover date boundaries, scope, CAS, replay, corrupt storage and actual SQLite rollback.

## What remains before SAL-007 can be considered complete

1. Integrate the new `createRecurringInvoiceScheduleFromSource` and `createRecurringInvoiceWorkspaceHostAdapter` with real Electron main/authorised Web server adapters. The source builder reads the posted invoice, customer and current products from trusted readers, aggregates precise source quantities and rejects wrong-branch/deleted/unpaid/measured records. These are **shared host contracts only**, not live credential-aware implementations. Cloud org/company/branch/sale/customer IDs must be real UUIDs; schedule/draft keys are intentionally opaque TEXT matching the deterministic SQLite planner, while posted financial invoice references remain UUID.
2. Wire production SQLite snapshots / backup / restore / sync with an idempotent cross-device occurrence writer and audited CAS. The pilot is deliberately *not* in commercial POS or sales source of truth.
3. Implement audited PostgreSQL RPCs with membership-RLS, tenant/company/branch foreign keys, persisted idempotency and conflict recovery. Staging tables currently have **no** client privileges.
4. Resolve current prices/taxes/discounts, quantities/stock, credit terms and invoice numbering on each occurrence using the existing **single** authorized sale+ledger+outbox transaction; require human approval before posting and sending. Never turn staged drafts into posted invoices implicitly.
5. Wire the shared `RecurringInvoiceWorkspace` to **real trusted Web and Windows host adapters** (currently presenter-only), add explicit host feature gate **OFF** by default, backup/restore and cross-device UAT. Build retry/audit views.
6. Exact-head CI and changed-code >=80% coverage; approve license gate and migrations; owner-authorised production deployment/release and customer UAT.

No new dependency. Original Minarva code only; Open Mercato v0.9.0 (`4374c48def1654927805c4b760f0e7f8648280f2`) was considered as MIT donor but no source was copied. No Aimeos/QUIQQER code.

Rollback: drop the isolated pilot/staging tables after a data retention review and revert the feature branch. Existing invoices, accounting and POS are unchanged.
