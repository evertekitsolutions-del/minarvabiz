# Minarva Biz — one-click Windows installer build
# Run in PowerShell:  right-click this file → Run with PowerShell
# Or:  powershell -ExecutionPolicy Bypass -File .\build-windows.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "=== Minarva Biz Windows Build ===" -ForegroundColor Cyan
Write-Host "Working folder: $PWD"

# Prefer pnpm 9.15 via Corepack (avoids pnpm 10 ignored-build-scripts errors)
Write-Host "Activating pnpm 9.15.0..." -ForegroundColor Yellow
try {
  corepack enable 2>$null
  corepack prepare pnpm@9.15.0 --activate
} catch {
  Write-Host "Corepack not available — using global pnpm" -ForegroundColor Yellow
}

$pnpmVersion = (pnpm --version)
Write-Host "pnpm version: $pnpmVersion"

Write-Host "Installing dependencies (public npm registry)..." -ForegroundColor Yellow
pnpm install --registry=https://registry.npmjs.org/
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }

Write-Host "Installing Electron desktop tools..." -ForegroundColor Yellow
Set-Location apps\desktop
pnpm add -D electron@33.2.1 vite@6.0.3 electron-builder@24.13.3 typescript @types/node --registry=https://registry.npmjs.org/
if ($LASTEXITCODE -ne 0) { throw "electron install failed" }

# Force rebuild native binaries if scripts were skipped
Write-Host "Rebuilding electron/esbuild binaries if needed..." -ForegroundColor Yellow
pnpm rebuild electron esbuild 2>$null
pnpm exec node node_modules/electron/install.js 2>$null
pnpm exec node node_modules/esbuild/install.js 2>$null

Write-Host "Building Windows installer (this may take several minutes)..." -ForegroundColor Yellow
pnpm run package:win
if ($LASTEXITCODE -ne 0) { throw "package:win failed" }

$setup = Join-Path $PWD "release\MinarvaBiz-Setup-1.0.0.exe"
if (Test-Path $setup) {
  Write-Host ""
  Write-Host "SUCCESS! Installer created:" -ForegroundColor Green
  Write-Host $setup -ForegroundColor Green
} else {
  Write-Host "Build finished but Setup.exe not found in release\. Check errors above." -ForegroundColor Red
  Get-ChildItem release -ErrorAction SilentlyContinue
}
