# Minarva Biz - Windows installer build
# Usage: powershell -ExecutionPolicy Bypass -File .\build-windows.ps1

$ErrorActionPreference = "Continue"
$Root = $PSScriptRoot
Set-Location -LiteralPath $Root

function Step($msg) {
  Write-Host ""
  Write-Host (">>> " + $msg) -ForegroundColor Cyan
}

function Fail($msg) {
  Write-Host ""
  Write-Host ("ERROR: " + $msg) -ForegroundColor Red
  exit 1
}

function Run-Check($label) {
  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
    Fail ($label + " failed (exit code " + $LASTEXITCODE + ")")
  }
}

Write-Host "========================================" -ForegroundColor Green
Write-Host "  Minarva Biz - Windows Build" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ("Folder: " + $Root)

Step "Checking Node.js"
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Fail "Node.js not found. Install LTS from https://nodejs.org and reopen PowerShell."
}
Write-Host ("Node: " + (node -v))

Step "Setting up pnpm 9.15"
$env:npm_config_registry = "https://registry.npmjs.org/"
cmd /c "corepack enable >nul 2>&1"
cmd /c "corepack prepare pnpm@9.15.0 --activate >nul 2>&1"

$pnpmCmd = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpmCmd) {
  Write-Host "Installing pnpm 9 globally..."
  npm install -g pnpm@9.15.0 --registry=https://registry.npmjs.org/
}
Write-Host ("pnpm: " + (pnpm -v))

Step "Cleaning old node_modules"
if (Test-Path "node_modules") {
  Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue
}
if (Test-Path "apps\desktop\node_modules") {
  Remove-Item -Recurse -Force "apps\desktop\node_modules" -ErrorAction SilentlyContinue
}

Step "Installing locked workspace dependencies"
pnpm install --frozen-lockfile --registry=https://registry.npmjs.org/
Run-Check "pnpm install"

Set-Location -LiteralPath (Join-Path $Root "apps\desktop")
Step "Ensuring Electron and esbuild binaries"
cmd /c "pnpm rebuild electron esbuild"
if (Test-Path "node_modules\electron\install.js") {
  cmd /c "node node_modules\electron\install.js"
}
Get-ChildItem -Path "node_modules" -Recurse -Filter "install.js" -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match "\\esbuild\\" } |
  Select-Object -First 2 |
  ForEach-Object { cmd /c ("node """ + $_.FullName + """") }

Step "Building installer"
pnpm run package:win
Run-Check "package:win"

$setup = Get-ChildItem -Path (Join-Path (Get-Location) "release") -Filter "MinarvaBiz-Setup-*.exe" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
Write-Host ""
if ($setup) {
  $size = [math]::Round($setup.Length / 1MB, 1)
  Write-Host "========================================" -ForegroundColor Green
  Write-Host "  SUCCESS" -ForegroundColor Green
  Write-Host "========================================" -ForegroundColor Green
  Write-Host ("Installer: " + $setup.FullName)
  Write-Host ("Size: " + $size + " MB")
  exit 0
}

Write-Host "Build finished but no MinarvaBiz-Setup-*.exe was found." -ForegroundColor Red
if (Test-Path "release") {
  Get-ChildItem "release" -Recurse | ForEach-Object { Write-Host $_.FullName }
}
Fail "MinarvaBiz-Setup-*.exe missing"
