# Windows build (MinarvaBiz-Setup.exe)

## Requirements
- Windows 10/11 x64
- Node 20+, pnpm 9+
- ≥4 GB free RAM recommended

## Commands
```bash
git clone https://github.com/evertekitsolutions-del/minarvabiz.git
cd minarvabiz
pnpm install
cd apps/desktop
pnpm add -D electron vite @vitejs/plugin-react electron-builder
# compile main process if needed, then:
pnpm run package:win
# or:
pnpm exec electron-builder --win --x64 --config electron-builder.yml
```

Installer output: `apps/desktop/release/MinarvaBiz-Setup-*.exe`

## Data location
`%APPDATA%\Minarva Biz\minarvabiz.db` (SQLite primary)

Uninstall does **not** delete AppData (`deleteAppDataOnUninstall: false`).
