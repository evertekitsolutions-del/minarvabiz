# Windows commercial build — MinarvaBiz-Setup.exe

## Requirements
- **Windows 10/11 x64** (recommended) or Linux with Wine + ≥4 GB RAM
- Node.js 20+
- pnpm 9+
- ≥4 GB free RAM (Electron download + NSIS packaging)

## Build commands (from repo root)

```bash
git clone https://github.com/evertekitsolutions-del/minarvabiz.git
cd minarvabiz
pnpm install

cd apps/desktop
pnpm add -D electron vite @vitejs/plugin-react electron-builder typescript @types/node

# Full Windows installer
pnpm run package:win
```

Equivalent:

```bash
pnpm run build:renderer
pnpm run build:electron
pnpm exec electron-builder --win --x64 --config electron-builder.yml
```

## Output
`apps/desktop/release/MinarvaBiz-Setup-1.0.0.exe`

## Post-install data path
`%APPDATA%\Minarva Biz\minarvabiz.db`

Uninstall does **not** remove AppData (`deleteAppDataOnUninstall: false`).

## Validation checklist
1. Install → launch → first-run admin setup → login  
2. Customer → product → sale → payment → stock check  
3. Order + measurement + order expense → profit  
4. Print A4 / thermal layout  
5. Backup → quit → reopen → data present  
6. Uninstall → confirm `%APPDATA%\Minarva Biz\minarvabiz.db` still exists  
