# Windows build — MinarvaBiz-Setup.exe

## Requirements
- Windows 10/11 x64
- Node.js 20+ (https://nodejs.org)
- pnpm 9 or 10: `npm install -g pnpm@9`

## Exact commands (copy/paste)

```powershell
cd $env:USERPROFILE\Desktop
Remove-Item -Recurse -Force MinarvaBiz-Build -ErrorAction SilentlyContinue
git clone https://github.com/evertekitsolutions-del/minarvabiz.git MinarvaBiz-Build
cd MinarvaBiz-Build

pnpm install

cd apps\desktop
pnpm add -D electron@33.2.1 vite@6.0.3 electron-builder@24.13.3 typescript @types/node
pnpm run package:win
```

Installer:

`apps\desktop\release\MinarvaBiz-Setup-1.0.0.exe`

## Notes
- Packages install from `https://registry.npmjs.org` only.
- Electron and esbuild install scripts are **approved** in root `package.json` → `pnpm.onlyBuiltDependencies`.
- Database path after install: `%APPDATA%\Minarva Biz\minarvabiz.db`
