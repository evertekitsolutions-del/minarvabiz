# A-SYNC-V2 financial envelope foundation

This slice adds a strict transport contract for tenant-, company-, branch- and device-scoped financial events and deterministic duplicate/collision behavior for adapters and tests.

## Reuse review

- **Open Mercato Core** — https://github.com/open-mercato/open-mercato — MIT-licensed TypeScript/Next.js/PostgreSQL business framework. Its modules are coupled to its framework and data model; bulk-copying a full CRM/ERP module into Minarva Biz's shared business-logic + Electron/SQLite architecture would introduce incompatible runtime, schema and tenancy assumptions. It is a reference/donor candidate, not a drop-in module.
- **Open Mercato Official Modules** — https://github.com/open-mercato/official-modules — MIT-licensed but archived in October 2026; not preferred for a new dependency.
- Minarva Biz already has a shared sync package, outbox, conflict policy and Supabase adapter. This slice extends that native boundary rather than adding a second framework or an unreviewed production dependency.

No upstream source file is copied by this slice. Contract behavior: validates scope, event type, currency, canonical UTC time and JSON-safe payload; detects in-process duplicates and idempotency collisions. This is **not** a durable replay guarantee: production still requires a unique `(tenant_id, idempotency_key)` database constraint and one transaction committing that key with the financial mutation.
