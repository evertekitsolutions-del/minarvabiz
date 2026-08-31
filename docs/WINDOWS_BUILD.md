# Windows commercial build — MinarvaBiz-Setup.exe

## Requirements
- Windows 10/11 x64
- Node.js 20+ (LTS)
- pnpm 9+ (`npm install -g pnpm@9`)
- ≥4 GB free RAM
- Stable internet to **https://registry.npmjs.org** (not a private mirror)

## Registry note
This project ships an `.npmrc` that forces:

```
registry=https://registry.npmjs.org/
```

If your machine has a global `.npmrc` pointing at an internal IP (e.g. `http://35.x.x.x/npm/`), either:

1. Use this repo’s `.npmrc` (preferred), or  
2. Temporarily: `npm config delete registry` then install again.

## Commands (from repo root)

```powershell
git clone https://github.com/evertekitsolutions-del/minarvabiz.git
cd minarvabiz

# Install all workspace packages (root)
pnpm install

# Desktop tooling (if not already in lockfile)
cd apps\desktop
pnpm add -D electron@33.2.1 vite@6.0.3 electron-builder@24.13.3 typescript @types/node

# Build renderer + Electron main + NSIS installer
pnpm run package:win
```

Installer output:

`apps\desktop\release\MinarvaBiz-Setup-1.0.0.exe`

## Data location
`%APPDATA%\Minarva Biz\minarvabiz.db`

Uninstall does **not** remove AppData (`deleteAppDataOnUninstall: false`).
