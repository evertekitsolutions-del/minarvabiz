# Minarva Biz - Windows installer build
# Usage: powershell -ExecutionPolicy Bypass -File .\build-windows.ps1

$ErrorActionPreference = "Stop"
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

Write-Host "========================================" -ForegroundColor Green
Write-Host "  Minarva Biz - Windows Build" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ("Folder: " + $Root)

# Check Node
Step "Checking Node.js"
try {
  $nodeVer = node -v
  Write-Host ("Node: " + $nodeVer)
} catch {
  Fail "Node.js not found. Install from https://nodejs.org (LTS) and reopen PowerShell."
}

# Prefer pnpm 9.15 (avoids pnpm 10 ignored build scripts)
Step "Setting up pnpm 9.15"
$env:npm_config_registry = "https://registry.npmjs.org/"
try {
  corepack enable | Out-Null
  corepack prepare pnpm@9.15.0 --activate
} catch {
  Write-Host "Corepack skip - will use existing pnpm"
}
try {
  $pnpmVer = pnpm -v
  Write-Host ("pnpm: " + $pnpmVer)
} catch {
  Write-Host "Installing pnpm 9 globally..."
  npm install -g pnpm@9.15.0 --registry=https://registry.npmjs.org/
  $pnpmVer = pnpm -v
  Write-Host ("pnpm: " + $pnpmVer)
}

# Clean partial installs that cause weird errors
Step "Cleaning old node_modules (if any)"
if (Test-Path "node_modules") { Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue }
if (Test-Path "apps\desktop\node_modules") { Remove-Item -Recurse -Force "apps\desktop\node_modules" -ErrorAction SilentlyContinue }

# Root install
Step "pnpm install (this may take a few minutes)"
pnpm install --registry=https://registry.npmjs.org/
if ($LASTEXITCODE -ne 0) { Fail "pnpm install failed" }

# Desktop tools
Step "Installing Electron + Vite + electron-builder"
Set-Location -LiteralPath (Join-Path $Root "apps\desktop")
pnpm add -D electron@33.2.1 vite@6.0.3 electron-builder@24.13.3 @vitejs/plugin-react@4.3.4 typescript@5.7.2 @types/node --registry=https://registry.npmjs.org/
if ($LASTEXITCODE -ne 0) { Fail "Failed to install Electron tooling" }

# Ensure native postinstall ran
Step "Ensuring electron and esbuild binaries"
pnpm rebuild electron esbuild 2>$null
if (Test-Path "node_modules\electron\install.js") {
  node "node_modules\electron\install.js"
}
$esbuildInstall = Get-ChildItem -Path "node_modules" -Recurse -Filter "install.js" -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match "esbuild" } |
  Select-Object -First 1
if ($esbuildInstall) {
  node $esbuildInstall.FullName
}

# Build renderer + main + NSIS installer
Step "Building installer (5-15 minutes on first run)"
pnpm run package:win
if ($LASTEXITCODE -ne 0) { Fail "package:win failed - scroll up for the real error" }

$setup = Join-Path (Get-Location) "release\MinarvaBiz-Setup-1.0.0.exe"
Write-Host ""
if (Test-Path $setup) {
  $size = [math]::Round((Get-Item $setup).Length / 1MB, 1)
  Write-Host "========================================" -ForegroundColor Green
  Write-Host "  SUCCESS" -ForegroundColor Green
  Write-Host "========================================" -ForegroundColor Green
  Write-Host ("Installer: " + $setup)
  Write-Host ("Size: " + $size + " MB")
} else {
  Write-Host "Build command finished but Setup.exe was not found." -ForegroundColor Red
  Write-Host "Contents of release folder:"
  if (Test-Path "release") { Get-ChildItem "release" -Recurse | Select-Object FullName, Length }
  Fail "MinarvaBiz-Setup-1.0.0.exe missing"
}
