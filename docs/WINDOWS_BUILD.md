# Windows build — MinarvaBiz-Setup.exe

## Requirements
- Windows 10/11 x64
- Node.js 20+ from https://nodejs.org
- pnpm 9: open PowerShell and run `npm install -g pnpm@9`
- Stable internet

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

Installer path:

`apps\desktop\release\MinarvaBiz-Setup-1.0.0.exe`

## Data location after install
`%APPDATA%\Minarva Biz\minarvabiz.db`

## Note
This project uses the **public** npm registry only (`https://registry.npmjs.org`).  
The lockfile no longer contains any private mirror URLs.
