# Domain persistence

## Snapshot format

The desktop domain snapshot is versioned and stored inside the native SQLite database in the `domain_kv` table. The current snapshot version is `3` and covers the core commerce, services, operations, staff, governance, branch, quotation, cash-session, and purchase-return state.

## Desktop

The Offline Windows edition uses native SQLite at:

`app.getPath('userData')/minarvabiz.db`

Renderer persistence goes through the Electron preload bridge and is serialized so rapid saves are written in FIFO order. Domain persistence is awaited and reports the native write result. The desktop app does not use `localStorage` as its primary persistence layer.

## Backup / restore

The desktop edition supports manual and automatic SQLite backups, integrity verification, export, restore with a pre-restore safety backup, and application relaunch after restore.

## Online / Hybrid

Online uses Supabase PostgreSQL. Hybrid keeps SQLite as the desktop primary store and uses the outbox/conflict-resolution architecture for cloud synchronization.

### Hybrid cloud pull cursors

Supabase pull uses the timestamp column that actually exists for each source table. Mutable rows use `updated_at`; append-only core rows such as payments, inventory transactions, order expenses, audit logs and goods receipts use `created_at`. `sale_items` has no timestamp in the core schema, so it is pulled only for sales returned in the same cycle and inherits the parent sale timestamp for conflict ordering. This avoids invalid `updated_at` filters silently skipping valid cloud rows without inventing schema fields or historical timestamps.
