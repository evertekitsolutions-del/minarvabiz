# UBP-05g — capability-negotiated dimensional cloud sale writer

## Implemented

- A read-only, `SECURITY INVOKER` `ubp_dimension_sale_capability()` PostgreSQL
  RPC is installed *after* the validated dimensional storage and atomic
  `create_sale` migrations. It returns the exact
  `{"protocol":"dimension-sale-v1","schemaVersion":1}` marker only for
  authenticated sales-permitted organization members when the server still
  has the dimensional storage column, write-once trigger, and revised atomic
  transaction implementation.
- The web writer requests that protocol **per dimensional sale**, checks
  that the authenticated session, user and server-verified owner scope are
  still current after the asynchronous request, and rejects malformed
  measurements before any financial mutation.
- It sends only canonical `dimension_metadata` inside the original
  `create_sale` transaction, requiring an exact `sale_id` and boolean
  idempotency receipt before the grouped sale/payment outbox can be
  acknowledged.
- The existing `createSale` path remains available only for ordinary sales.
  Dimensional sales can never fall back to that older writer.
- A logout or user/tenant change during an RPC prevents the old session's
  acknowledgement from marking the current outbox synced.
- Web sale transport is extracted to `data-source-sales.ts`, preserving the
  production governance limit on `data-source.ts`.

## Rollout constraints

**All changes are source code only.** Hosted Supabase has not been migrated,
and Windows installer publication / customer-facing area POS activation remain
separate rollout decisions. In an environment lacking the new capability RPC,
the web writer rejects dimensional cloud checkout and the durable financial
events remain unacknowledged for authorized recovery. Do not automatically
replay these events using legacy direct-table sync.

The handshake is protocol compatibility, not a substitute for atomic
PostgreSQL tenant authorization, financial provenance, branch grants or
stock constraints. Before customer rollout verify cloud sale hydration,
Windows SQLite parity, offline replays, invoice printing and returns.

## Verification

- `dimension-sale-protocol.test.mjs`: protocol and exact receipt negatives.
- `remote-cloud-ack-integrity.test.mjs`: server-specific writer dispatch,
  financial group acknowledgement and logout fencing.
- `scripts/ubp05g-dimension-capability-e2e.mjs`: optional local-only,
  rollback-safe authorized/unauthorized capability fixture.
- `First Admin Fresh Instance E2E`: authoritative fresh-migration replay.
- Web/desktop type checks, coverage, browser smoke and Windows smoke required
  before merge.

No subscription, paid AI service, or mandatory external host was introduced.
