import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const assert = (condition, message) => {
  if (!condition) throw new Error(`QUALITY CHECK FAILED: ${message}`);
};

const criticalDesktopFiles = [
  "apps/desktop/electron/main.ts",
  "apps/desktop/electron/preload.ts",
  "apps/desktop/src/App.tsx",
  "apps/desktop/src/lib/sqlite-bootstrap.ts",
];
for (const file of criticalDesktopFiles) assert(exists(file), `Missing critical desktop file: ${file}`);

const desktopSource = criticalDesktopFiles.map(read).join("\n");
const appSource = read("apps/desktop/src/App.tsx");
const preloadSource = read("apps/desktop/electron/preload.ts");
const sqliteBootstrap = read("apps/desktop/src/lib/sqlite-bootstrap.ts");
const persistence = read("packages/business-logic/src/persistence.ts");
const phase10 = read("packages/business-logic/src/phase10-operations-store.ts");
const phase9 = read("packages/business-logic/src/phase9-store.ts");
const sqliteAdapter = read("packages/database/src/adapters/sqlite.ts");
const licensing = read("packages/licensing/src/activation.ts") + read("packages/licensing/src/issuer.ts");
const token = read("packages/licensing/src/token.ts");
const licenseConfigWriter = read("apps/desktop/scripts/write-license-config.mjs");
const updateConfigWriter = read("apps/desktop/scripts/write-update-config.mjs");
const updater = read("apps/desktop/electron/updater.ts");
const workflow = read(".github/workflows/ci.yml");
const releaseWorkflow = read(".github/workflows/release-windows.yml");
const builder = read("apps/desktop/electron-builder.yml");
const desktopPackage = JSON.parse(read("apps/desktop/package.json"));
const businessLogicPackage = JSON.parse(read("packages/business-logic/package.json"));
const uiPackage = JSON.parse(read("packages/ui/package.json"));
const activationRoute = read("apps/web/src/app/api/license/activate/route.ts");
const trialRoute = read("apps/web/src/app/api/trial/register/route.ts");
const activationMigration = read("supabase/migrations/20260911_license_activation_atomicity.sql");
const settingsPanel = read("packages/ui/src/components/settings/SettingsPanel.tsx");
const nav = read("packages/ui/src/lib/nav.ts");

assert(!desktopSource.includes("minarvabiz-db.json"), "Legacy JSON database reference exists in desktop source");
assert(!desktopSource.includes('db:read"') && !desktopSource.includes('db:write"'), "Legacy db:read/db:write IPC returned");
assert(preloadSource.includes("writeSqliteBinary"), "SQLite binary write bridge is missing");
assert(sqliteBootstrap.includes("persistDomainToSqlite(): Promise<boolean>"), "SQLite persistence must be awaitable");
assert(sqliteBootstrap.includes("await persistDomainToSqlite()"), "Initial SQLite persistence must be awaited");
assert(sqliteBootstrap.includes("return pendingWrite;"), "SQLite persistence must return the native write result");
assert(appSource.includes("persistDomainToSqlite") && !appSource.includes("localStorage."), "Desktop App persistence wiring is incorrect");
assert(sqliteAdapter.includes('require("sql.js/dist/sql-asm.js")'), "Packaged SQLite must use the self-contained ASM.js build");
assert(sqliteAdapter.includes("serviceType: String(r.service_type)"), "SQLite order mapping must expose ServiceOrder serviceType");
assert(sqliteAdapter.includes("price: Number(r.price || 0)"), "SQLite order mapping must use the current price column");
assert(sqliteAdapter.includes("advance: Number(r.advance || 0)"), "SQLite order mapping must use the current advance column");
assert(sqliteAdapter.includes("balance: Number(r.balance || 0)"), "SQLite order mapping must use the current balance column");
assert(!phase9.includes("activateDemoPlan") && !phase9.includes("DEMO_PUBLIC_KEY_HEX") && !phase9.includes("applyDemoPlan"), "Removed demo licensing APIs are still referenced");
assert(licensing.includes("activateWithToken") && licensing.includes("startTrial"), "Shared licensing lifecycle APIs are missing");
assert(token.includes("function isLicensePayload") && token.includes("activationLimit"), "Signed license payload guards are missing");
assert(licenseConfigWriter.includes("MINARVA_LICENSE_PUBLIC_KEY_HEX"), "Commercial build public-key configuration is missing");
assert(licenseConfigWriter.includes("MINARVA_COMMERCIAL_RELEASE"), "Commercial release guard is missing");
assert(licenseConfigWriter.includes("!configured"), "Commercial build must reject a missing supplied public key");
assert(licenseConfigWriter.includes("/^[0-9a-f]{64}$/"), "Public key validation must require 64 hex characters");
assert(!desktopSource.includes("LICENSE_PRIVATE_KEY") && !desktopSource.includes("BEGIN PRIVATE KEY"), "Private signing key material must never ship in desktop source");
assert(persistence.includes("SNAPSHOT_VERSION = 7"), "Domain snapshot version must include operations, stock-transfer history, print settings, and held POS sales");
assert(persistence.includes("phase10Store.exportPhase10State") && persistence.includes("phase10Store.hydratePhase10"), "Phase-10 state is missing from domain snapshots");
assert(persistence.includes("activeBranchId"), "Branch state is missing from domain snapshots");
assert(phase10.includes("ensureProductionWorkflow") && phase10.includes("advanceProductionWorkflow"), "Production workflow persistence is missing");
assert(phase10.includes("createMaterialRoll") && phase10.includes("reserveMaterialRoll") && phase10.includes("consumeMaterialFromRoll"), "Material roll lifecycle is missing");
assert(phase10.includes('enqueueOutbox("production_workflows"') && phase10.includes('enqueueOutbox("material_rolls"'), "Phase-10 mutations must enter the sync outbox");
assert(phase10.includes("touchPersistence()"), "Phase-10 mutations must trigger persistence");
assert(nav.includes("dashboard") && nav.includes("sales") && nav.includes("products") && nav.includes("laundry") && nav.includes("reports") && nav.includes("backup"), "Core navigation modules are missing");
assert(workflow.includes("Guard against legacy JSON persistence") && workflow.includes("package:win") && workflow.includes("MINARVA_RUNTIME_SMOKE"), "CI desktop verification guards are incomplete");
assert(workflow.includes("actions/checkout@v7") && workflow.includes("actions/setup-node@v7") && workflow.includes("pnpm/action-setup@v6") && workflow.includes("actions/upload-artifact@v6"), "CI action versions are incomplete");
assert(releaseWorkflow.includes("actions/checkout@v7") && releaseWorkflow.includes("actions/setup-node@v7") && releaseWorkflow.includes("pnpm/action-setup@v6") && releaseWorkflow.includes("actions/upload-artifact@v6"), "Release action versions are incomplete");
assert(releaseWorkflow.includes("MINARVA_RUNTIME_SMOKE") && releaseWorkflow.includes("MINARVA_LICENSE_PUBLIC_KEY_HEX"), "Release licensing/runtime verification is incomplete");
assert(builder.includes("productName: Minarva Biz"), "Windows package must identify Minarva Biz");
assert(activationMigration.includes("CREATE OR REPLACE FUNCTION public.activate_license_device") && activationMigration.includes("FOR UPDATE") && activationMigration.includes("activation_limit <> -1"), "Atomic activation migration is incomplete");
assert(activationMigration.includes("REVOKE ALL ON FUNCTION public.activate_license_device"), "Atomic activation RPC must not be public");
assert(activationRoute.includes('rpc("activate_license_device"') && !activationRoute.includes('.select("id", { count: "exact"'), "Web activation route is not using the atomic activation path");
assert(activationRoute.includes("MAX_BODY_BYTES = 16 * 1024") && activationRoute.includes("await request.text()"), "License activation request size guard is missing");
assert(trialRoute.includes("MAX_BODY_BYTES = 16 * 1024") && trialRoute.includes("await request.text()"), "Trial registration request size guard is missing");
assert(activationRoute.includes("status: 415") && activationRoute.includes("content-type"), "License activation JSON content-type enforcement is missing");
assert(trialRoute.includes("status: 415") && trialRoute.includes("content-type"), "Trial registration JSON content-type enforcement is missing");
assert(settingsPanel.includes("Support diagnostics") && settingsPanel.includes("redacted: true") && settingsPanel.includes("customer names"), "Support diagnostics redaction guard is missing");
assert(uiPackage.scripts?.typecheck === "tsc --noEmit", "Shared UI typecheck script is missing");
assert(businessLogicPackage.scripts?.typecheck === "tsc --noEmit", "Business-logic typecheck script is missing");
assert(desktopPackage.scripts?.["package:win"]?.includes("electron-builder --win"), "Windows packaging script is missing");
assert(updateConfigWriter.includes("MINARVA_UPDATE_MANIFEST_URL") && updateConfigWriter.includes("MINARVA_UPDATE_PUBLIC_KEY_HEX") && updateConfigWriter.includes("https:"), "Secure updater build configuration is incomplete");
assert(updater.includes("verifyManifestSignature") && updater.includes("createPublicKey") && updater.includes("verify(null"), "Secure updater manifest signature verification is missing");
assert(updater.includes('createHash("sha256")') && updater.includes("Installer SHA-256 verification failed"), "Secure updater installer hash verification is missing");
assert(updater.includes("500 * 1024 * 1024") && updater.includes("AbortSignal.timeout"), "Secure updater download guards are incomplete");
assert(desktopSource.includes('ipcMain.handle("update:install"') && desktopSource.includes('createLocalBackup("automatic")') && desktopSource.includes("isValidSqliteFile(backup.path)"), "Updater must require a verified pre-update SQLite backup");
assert(preloadSource.includes("checkForUpdates") && preloadSource.includes("downloadUpdate") && preloadSource.includes("installUpdate"), "Updater IPC preload bridge is incomplete");
assert(settingsPanel.includes("Software updates") && settingsPanel.includes("Updates are never forced"), "Customer-facing secure updater controls are missing");
assert(desktopPackage.scripts?.["prepare:update"]?.includes("write-update-config.mjs") && desktopPackage.scripts?.["build:electron"]?.includes("prepare:update"), "Updater config generation is missing from desktop build");


console.log("Minarva Biz quality smoke: PASS");
