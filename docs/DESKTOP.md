# Desktop (Electron) packaging

## Security model

- `contextIsolation: true`
- `nodeIntegration: false`
- Sandboxed preload
- IPC only for version, paths, and durable DB read/write

## Data file

`app.getPath('userData')/minarvabiz-db.json` via file-JSON adapter.

For production native SQLite:

```bash
pnpm add better-sqlite3 drizzle-orm
# implement packages/database/src/adapters/sqlite.ts using SQLITE_DDL
```

## Package Windows installer

On a machine with ≥4GB RAM:

```bash
pnpm install
cd apps/desktop
pnpm add -D electron vite @vitejs/plugin-react electron-builder concurrently wait-on
# add icons under build/
pnpm exec electron-builder --win --config electron-builder.yml
```

Output: `apps/desktop/release/MinarvaBiz-Setup-*.exe`

## Dev renderer

```bash
# terminal 1
pnpm exec vite --config apps/desktop/vite.config.ts
# terminal 2
electron .
```
