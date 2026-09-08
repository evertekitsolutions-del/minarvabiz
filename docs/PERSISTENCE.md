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