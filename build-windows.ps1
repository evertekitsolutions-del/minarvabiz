# Minarva Biz - Windows installer build script
# Run: powershell -ExecutionPolicy Bypass -File .\build-windows.ps1

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "=== Minarva Biz Windows Build ===" -ForegroundColor Cyan
Write-Host ("Working folder: " + $PWD)

Write-Host "Activating pnpm 9.15.0 via Corepack..." -ForegroundColor Yellow
try {
  corepack enable 2>$null
  corepack prepare pnpm@9.15.0 --activate
} catch {
  Write-Host "Corepack not available - using global pnpm" -ForegroundColor Yellow
}

$pnpmVersion = pnpm --version
Write-Host ("pnpm version: " + $pnpmVersion)

Write-Host "Installing dependencies..." -ForegroundColor Yellow
pnpm install --registry=https://registry.npmjs.org/
if ($LASTEXITCODE -ne 0) {
  throw "pnpm install failed"
}

Write-Host "Installing Electron desktop tools..." -ForegroundColor Yellow
Set-Location -Path "apps\desktop"
pnpm add -D electron@33.2.1 vite@6.0.3 electron-builder@24.13.3 typescript @types/node --registry=https://registry.npmjs.org/
if ($LASTEXITCODE -ne 0) {
  throw "electron install failed"
}

Write-Host "Rebuilding electron/esbuild binaries if needed..." -ForegroundColor Yellow
pnpm rebuild electron esbuild 2>$null
if (Test-Path "node_modules\electron\install.js") {
  pnpm exec node node_modules\electron\install.js 2>$null
}
if (Test-Path "node_modules\esbuild\install.js") {
  pnpm exec node node_modules\esbuild\install.js 2>$null
}

Write-Host "Building Windows installer (please wait)..." -ForegroundColor Yellow
pnpm run package:win
if ($LASTEXITCODE -ne 0) {
  throw "package:win failed"
}

$setup = Join-Path $PWD "release\MinarvaBiz-Setup-1.0.0.exe"
if (Test-Path $setup) {
  Write-Host ""
  Write-Host "SUCCESS! Installer created:" -ForegroundColor Green
  Write-Host $setup -ForegroundColor Green
} else {
  Write-Host "Build finished but Setup.exe not found in release folder. Check errors above." -ForegroundColor Red
  if (Test-Path "release") {
    Get-ChildItem "release"
  }
}
