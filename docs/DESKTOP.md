# Desktop (Electron) packaging

## Security model

- `contextIsolation: true`
- `nodeIntegration: false`
- Sandboxed preload
- IPC only for version, paths, and durable SQLite DB read/write

## Data file

The Offline Windows edition uses native SQLite at:

`app.getPath('userData')/minarvabiz.db`

The renderer accesses the database through the narrow Electron preload bridge (`readSqliteBinary` / `writeSqliteBinary`). No legacy JSON database is used as the desktop persistence store.

## Package Windows installer

On a machine with ≥4GB RAM:

```bash
pnpm install
cd apps/desktop
pnpm exec electron-builder --win --config electron-builder.yml
```

The repository CI builds the installer on `windows-latest`, verifies that an `.exe` is produced, installs it silently, launches the installed application, and checks that a valid SQLite database is created under the standard Windows application-data roots.

Output: `apps/desktop/release/MinarvaBiz-Setup-*.exe`

## Dev renderer

```bash
# terminal 1
pnpm exec vite --config apps/desktop/vite.config.ts
# terminal 2
electron .
```
