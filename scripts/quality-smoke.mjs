import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`QUALITY CHECK FAILED: ${message}`);
  }
}

const desktopFiles = [
  "apps/desktop/electron/main.ts",
  "apps/desktop/electron/preload.ts",
  "apps/desktop/src/App.tsx",
  "apps/desktop/src/lib/sqlite-bootstrap.ts",
];

for (const file of desktopFiles) assert(exists(file), `Missing critical desktop file: ${file}`);

const desktopSource = desktopFiles.map(read).join("\n");
const workflow = read(".github/workflows/ci.yml");
const releaseWorkflow = read(".github/workflows/release-windows.yml");
const vite = read("apps/desktop/vite.config.ts");
const tailwind = read("apps/desktop/tailwind.config.js");
const desktopPackage = JSON.parse(read("apps/desktop/package.json"));
const builder = read("apps/desktop/electron-builder.yml");
const licenseConfigWriter = read("apps/desktop/scripts/write-license-config.mjs");
const businessLogicPackage = JSON.parse(read("packages/business-logic/package.json"));
const uiPackage = JSON.parse(read("packages/ui/package.json"));
const persistence = read("packages/business-logic/src/persistence.ts");
const sqliteBootstrap = read("apps/desktop/src/lib/sqlite-bootstrap.ts");
const nav = read("packages/ui/src/lib/nav.ts");
const licensingToken = read("packages/licensing/src/token.ts");

assert(!/minarvabiz-db\.json/.test(desktopSource), "Legacy JSON database file reference exists in desktop source");
assert(!/ipcMain\.handle\(\s*[\"']db:(read|write)[\"']/.test(desktopSource), "Legacy db:read/db:write IPC handler returned to desktop source");
assert(/ipcMain\.handle\(\s*[\"']db:readBinary[\"']/.test(desktopSource), "SQLite binary read IPC handler is missing");
assert(/ipcMain\.handle\(\s*[\"']db:writeBinary[\"']/.test(desktopSource), "SQLite binary write IPC handler is missing");
assert(/writeSqliteBinary:\s*\(/.test(read("apps/desktop/electron/preload.ts")), "Preload does not expose SQLite write bridge");
assert(/persistDomainToSqlite\(\): Promise<boolean>/.test(sqliteBootstrap), "SQLite domain persistence is not awaitable");
assert(/await persistDomainToSqlite\(\)/.test(sqliteBootstrap), "Initial SQLite persistence is not awaited");
assert(/return pendingWrite;/.test(sqliteBootstrap), "SQLite persistence does not return native write result");
assert(/base:\s*[\"']\.\/[\"']/.test(vite), "Vite production base path is not relative for Electron file://");
assert(/packages\/ui\/src/.test(tailwind), "Tailwind content scan does not include shared UI package");
assert(/build:renderer/.test(desktopPackage.scripts?.build ?? ""), "Desktop build script is missing renderer build");
assert(/electron-builder --win/.test(desktopPackage.scripts?.["package:win"] ?? ""), "Windows packaging script is missing");
assert(uiPackage.scripts?.typecheck === "tsc --noEmit", "Shared UI package must retain explicit typecheck script");
assert(businessLogicPackage.scripts?.typecheck === "tsc --noEmit", "Business-logic package must retain explicit typecheck script");
assert(/SNAPSHOT_VERSION\s*=\s*3/.test(persistence), "Domain snapshot version is missing or changed unexpectedly");
assert(/branches:\s*Branch\[\]/.test(persistence) && /activeBranchId/.test(persistence), "Branch state is missing from domain snapshots");
assert(/quotations\?/.test(persistence) && /cashSessions\?/.test(persistence) && /purchaseReturns\?/.test(persistence), "Extended business snapshot state is missing");
assert(/dashboard/.test(nav) && /sales/.test(nav) && /products/.test(nav) && /laundry/.test(nav) && /reports/.test(nav) && /backup/.test(nav), "Core navigation modules are missing");
assert(workflow.includes("Guard against legacy JSON persistence"), "CI legacy JSON guard is missing");
assert(workflow.includes("Inspect generated renderer CSS"), "CI renderer CSS verification is missing");
assert(workflow.includes("package:win"), "CI Windows packaging verification is missing");
assert(workflow.includes("MINARVA_RUNTIME_SMOKE"), "CI Windows runtime smoke is missing");
assert(workflow.includes("actions/checkout@v7"), "CI should use the Node 24-compatible checkout action");
assert(workflow.includes("actions/setup-node@v7"), "CI should use the Node 24-compatible setup-node action");
assert(workflow.includes("pnpm/action-setup@v6"), "CI should use the current pnpm setup action");
assert(workflow.includes("actions/upload-artifact@v6"), "CI should use the Node 24-compatible artifact action");
assert((workflow.match(/node-version:\s*24/g) || []).length >= 3, "CI build jobs must use Node 24");
assert(releaseWorkflow.includes("actions/checkout@v7"), "Windows release workflow should use checkout@v7");
assert(releaseWorkflow.includes("actions/setup-node@v7"), "Windows release workflow should use setup-node@v7");
assert(releaseWorkflow.includes("pnpm/action-setup@v6"), "Windows release workflow should use pnpm/action-setup@v6");
assert(releaseWorkflow.includes("actions/upload-artifact@v6"), "Windows release workflow should use upload-artifact@v6");
assert((releaseWorkflow.match(/node-version:\s*24/g) || []).length >= 1, "Windows release workflow must use Node 24");
assert(releaseWorkflow.includes("MINARVA_RUNTIME_SMOKE"), "Windows release runtime smoke is missing");
assert(releaseWorkflow.includes("Verify bundled production public key"), "Windows release public-key verification is missing");
assert(releaseWorkflow.includes("MINARVA_LICENSE_PUBLIC_KEY_HEX"), "Windows release licensing configuration validation is missing");
assert(/productName:\s*Minarva Biz/.test(builder), "Windows package must identify the product as Minarva Biz");
assert(/const productionPublicKey = \"[0-9a-f]{64}\"/.test(licenseConfigWriter), "Desktop license build must contain a valid production public key");
assert(!/(BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY)/i.test(desktopSource), "Private signing key material must never be present in desktop source");
assert(!/(MINARVA|LICENSE)_LICENSE_PRIVATE_KEY|LICENSE_PRIVATE_KEY/i.test(desktopSource), "Private license key environment/config names must not be present in desktop source");

const sqliteHeaderCheck = /const sqliteHeader = Buffer\.from\("SQLite format 3", "ascii"\);\s*if \(!header\.subarray\(0, sqliteHeader\.length\)\.equals\(sqliteHeader\) \|\| header\[sqliteHeader\.length\] !== 0\)/;
assert(sqliteHeaderCheck.test(desktopSource), "SQLite validation must compare the 15-byte magic string plus the terminating NUL byte");
assert(!/toString\("utf8"\)\s*!==\s*"SQLite format 3\\\\u0000"/.test(desktopSource), "SQLite validation must not compare against a literal backslash-u NUL sequence");

const restoreRollbackCheck = /const target = sqlitePath\(\), temp = `\$\{target\}\.restore-\$\{process\.pid\}-\$\{Date\.now\(\)\}`, rollback = `\$\{target\}\.rollback-\$\{process\.pid\}-\$\{Date\.now\(\)\}`;\s*let targetMoved = false;[\s\S]*?if \(fs\.existsSync\(target\)\) \{ fs\.renameSync\(target, rollback\); targetMoved = true; \} fs\.renameSync\(temp, target\);[\s\S]*?if \(fs\.existsSync\(target\) && targetMoved\) fs\.unlinkSync\(target\);[\s\S]*?if \(targetMoved && fs\.existsSync\(rollback\)\) \{ fs\.renameSync\(rollback, target\); \}/;
assert(restoreRollbackCheck.test(desktopSource), "Backup restore must retain and restore the previous database when replacement fails");

const signedPayloadGuards = [
  /const LICENSE_PLANS = new Set\(\["trial", "basic", "professional", "business", "enterprise"\]\)/,
  /const LICENSE_EDITIONS = new Set\(\["online", "offline", "hybrid"\]\)/,
  /function isIsoDate\(value: unknown\)/,
  /function isLicenseFeatures\(value: unknown\)/,
  /Number\.isSafeInteger\(payload\.activationLimit\)/,
  /payload\.expiresAt !== null && new Date\(payload\.expiresAt\)\.getTime\(\) < new Date\(payload\.issuedAt\)\.getTime\(\)/,
  /return isLicensePayload\(payload\) \? payload : null;/,
];
for (const guard of signedPayloadGuards) assert(guard.test(licensingToken), `Signed license payload structural guard is missing: ${guard}`);

// localStorage is permitted only as a web fallback. Desktop must use the native bridge.
const desktopAppSource = read("apps/desktop/src/App.tsx");
assert(!/localStorage\./.test(desktopAppSource), "Desktop App directly uses localStorage as persistence");
assert(/persistDomainToSqlite/.test(desktopAppSource), "Desktop App is not wired to SQLite persistence");
assert(/__minarvaDesktopPersist/.test(sqliteBootstrap), "Desktop native persistence bridge is missing");

console.log("Minarva Biz quality smoke: PASS");
console.log(`Verified ${desktopFiles.length} critical desktop files, SQLite-only desktop persistence wiring, SQLite binary-header validation, rollback-safe backup restore, structured signed-license payload validation, Electron packaging, Node 24 CI hardening, Node 24 release workflow hardening, license public-key safety, CI guards, shared UI/business-logic contracts, and domain snapshot coverage.`);