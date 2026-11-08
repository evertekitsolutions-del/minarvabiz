import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../apps/desktop/electron/customer-demo-reset.ts", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../apps/desktop/electron/main.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length || 0, 0, "retired reset module must compile");
const module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){\n${compiled.outputText}\n})`)(() => {
  throw new Error("Retired reset may not depend on filesystem operations");
}, module, module.exports);
const { isLegacyShowcaseInstallation, resetLegacyShowcaseBusinessData } = module.exports;
const identity = { organizationName: "ERA WARDROBE", activatedAt: "2026-11-04T09:57:49.000Z" };

assert.equal(isLegacyShowcaseInstallation(identity), true, "historical identity must remain recognizable for recovery");
assert.equal(isLegacyShowcaseInstallation({ ...identity, organizationName: "OTHER BUSINESS" }), false);
assert.equal(isLegacyShowcaseInstallation({ ...identity, activatedAt: "2026-11-05T00:00:00.000Z" }), false);
assert.equal(main.includes("resetLegacyShowcaseBusinessData("), false,
  "The Electron startup must not invoke customer data reset under any identity");
assert.equal(main.includes('from "./customer-demo-reset"'), false,
  "The Electron startup must not even import the destructive historical reset");
assert.equal(source.includes("renameSync"), false);
assert.equal(source.includes("unlinkSync"), false);
assert.equal(source.includes("rmSync"), false);

const root = fs.mkdtempSync(path.join(os.tmpdir(), "minarva-p0-no-auto-reset-"));
try {
  const dbPath = path.join(root, "minarvabiz.db");
  const backupDir = path.join(root, "backups");
  fs.mkdirSync(backupDir);
  const archive = path.join(backupDir, "minarvabiz-pre-update-era-wardrobe-archived.db");
  const marker = path.join(root, "era-wardrobe-business-cleanup-v1.json");
  fs.writeFileSync(dbPath, "customer live SQLite image");
  fs.writeFileSync(archive, "customer original archived SQLite image");
  fs.writeFileSync(marker, '{"archive":"must not change"}');
  let backupCalls = 0;
  const backupDatabase = async () => {
    backupCalls++;
    throw new Error("Legacy reset must not read, copy or mutate data");
  };

  const blocked = await resetLegacyShowcaseBusinessData({ userDataDir: root, trial: identity, backupDatabase });
  assert.equal(blocked.status, "blocked");
  assert.match(blocked.error, /retired/);
  const unrelated = await resetLegacyShowcaseBusinessData({
    userDataDir: root, trial: { ...identity, organizationName: "OTHER BUSINESS" }, backupDatabase,
  });
  assert.equal(unrelated.status, "skipped");
  assert.equal(backupCalls, 0);
  assert.equal(fs.readFileSync(dbPath, "utf8"), "customer live SQLite image");
  assert.equal(fs.readFileSync(archive, "utf8"), "customer original archived SQLite image");
  assert.equal(fs.readFileSync(marker, "utf8"), '{"archive":"must not change"}');
  console.log("P0 customer database automatic reset disabled; live SQLite, archive and marker retained PASS");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
