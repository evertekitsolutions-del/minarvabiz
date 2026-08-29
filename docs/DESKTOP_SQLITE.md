# Desktop SQLite — primary offline database

## Data flow

```
UI (Electron renderer)
  → business-logic domain mutations
  → touchPersistence()
  → __minarvaDesktopPersist()
  → domain snapshot + normalized rows
  → SQLite file: %APPDATA%\Minarva Biz\minarvabiz.db
  → outbox events (hybrid)
  → Supabase (when online)
```

## Rules
- Production desktop **requires** SQLite. App shows fatal error if init fails.
- localStorage is **not** the primary business store on desktop.
- Demo seed is disabled (`MINARVA_MODE=production`).
- Backup/restore should copy `minarvabiz.db`.

## Startup
1. Electron main sets path to `userData/minarvabiz.db`
2. Renderer calls `bootstrapDesktopSqlite()` before any business UI
3. Loads snapshot from SQLite into domain stores
4. Every mutation re-persists to SQLite
