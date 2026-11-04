import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const source = fs.readFileSync(new URL("../apps/desktop/electron/customer-demo-reset.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length || 0, 0, "reset migration must compile");
const module = { exports: {} };
const wrapped = vm.runInThisContext(`(function(require, module, exports) {\n${compiled.outputText}\n})`);
wrapped(createRequire(import.meta.url), module, module.exports);
const { isLegacyShowcaseInstallation, resetLegacyShowcaseBusinessData } = module.exports;

const activatedAt = "2026-11-04T09:57:49.000Z";
const identity = { organizationName: "ERA WARDROBE", activatedAt };
assert.equal(isLegacyShowcaseInstallation(identity), true);
assert.equal(isLegacyShowcaseInstallation({ ...identity, organizationName: "OTHER BUSINESS" }), false);
assert.equal(isLegacyShowcaseInstallation({ ...identity, activatedAt: "2026-11-05T00:00:00.000Z" }), false);
assert.equal(isLegacyShowcaseInstallation({ ...identity, activatedAt: "invalid" }), false);

const root = fs.mkdtempSync(path.join(os.tmpdir(), "minarva-showcase-reset-"));
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const db = path.join(root, "minarvabiz.db");
const verified = path.join(root, "backups", "verified-pre-update.db");
const sample = "legacy demo staff, suppliers, products and customer orders";
fs.writeFileSync(db, sample);
fs.writeFileSync(path.join(root, "trial-state.bin"), "encrypted-trial-still-valid");
fs.writeFileSync(path.join(root, "device-id"), "device-unchanged");
fs.writeFileSync(path.join(root, "license-state.bin"), "license-preserved");

let backupCalls = 0;
const backupDatabase = async () => {
  backupCalls++;
  fs.mkdirSync(path.dirname(verified), { recursive: true });
  fs.copyFileSync(db, verified);
  return { ok: true, path: verified };
};

try {
  const unrelated = await resetLegacyShowcaseBusinessData({
    userDataDir: root, trial: { ...identity, organizationName: "NOT ERA WARDROBE" }, backupDatabase
  });
  assert.equal(unrelated.status, "skipped");
  assert.equal(backupCalls, 0);
  assert.equal(read("minarvabiz.db"), sample);

  const failed = await resetLegacyShowcaseBusinessData({
    userDataDir: root, trial: identity,
    backupDatabase: async () => ({ ok: false, error: "backup unavailable" })
  });
  assert.equal(failed.status, "blocked");
  assert.equal(read("minarvabiz.db"), sample);

  const completed = await resetLegacyShowcaseBusinessData({
    userDataDir: root, trial: identity, backupDatabase
  });
  assert.equal(completed.status, "reset");
  assert.equal(backupCalls, 1);
  assert.equal(fs.existsSync(db), false, "legacy DB must not be rehydrated after update");
  assert.equal(fs.readFileSync(completed.backupPath, "utf8"), sample, "verified image is preserved");
  assert.equal(fs.readFileSync(completed.archivedPath, "utf8"), sample, "original image is preserved");
  assert.equal(read("trial-state.bin"), "encrypted-trial-still-valid");
  assert.equal(read("device-id"), "device-unchanged");
  assert.equal(read("license-state.bin"), "license-preserved");

  const rerun = await resetLegacyShowcaseBusinessData({
    userDataDir: root, trial: identity, backupDatabase
  });
  assert.equal(rerun.status, "already_applied");
  assert.equal(backupCalls, 1, "reset must be strictly one-time");
  console.log("Customer-scoped in-app update demo-clean regression PASS");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
