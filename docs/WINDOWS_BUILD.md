# Windows installer build

## Easiest method (recommended)

1. Download/clone the repository to your Desktop.
2. Double-click **`BUILD-WINDOWS.cmd`**
3. Wait until you see **SUCCESS**
4. Installer path:

`apps\desktop\release\MinarvaBiz-Setup-1.0.0.exe`

## Or PowerShell (one block)

```powershell
cd $env:USERPROFILE\Desktop
Remove-Item -Recurse -Force MinarvaBiz-Build -ErrorAction SilentlyContinue
git clone https://github.com/evertekitsolutions-del/minarvabiz.git MinarvaBiz-Build
cd MinarvaBiz-Build
powershell -ExecutionPolicy Bypass -File .\build-windows.ps1
```

## Notes
- Uses public npm only (`registry.npmjs.org`)
- Forces **pnpm 9.15** via Corepack when available (avoids “Ignored build scripts”)
- Approves electron/esbuild install scripts in `package.json`
