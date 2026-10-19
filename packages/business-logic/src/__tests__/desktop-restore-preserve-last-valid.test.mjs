import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename,
);

const { reconcileFailedSqliteRestore } =
  require("../../../../apps/desktop/electron/sqlite-restore-failure.ts");
const main = fs.readFileSync("apps/desktop/electron/main.ts", "utf8");
const restore = main.slice(main.indexOf('ipcMain.handle("backup:restoreFromFile"'),
  main.indexOf('ipcMain.handle("printer:list"'));
const valid = async file => fs.readFileSync(file, "utf8").startsWith("good ")
  ? null : "invalid SQLite image";

function fixture(label) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "minarva-last-valid-" + label + "-"));
  const stageDirectory = fs.mkdtempSync(path.join(parent, ".minarva-restore-"));
  const target = path.join(parent, "minarvabiz.db");
  const rollback = path.join(stageDirectory, "rollback.db");
  fs.writeFileSync(path.join(stageDirectory, "restore-journal.json"), '{"version":1}');
  return {
    parent, stageDirectory, target, rollback,
    state: { target, rollback, stageDirectory, hadTarget: true, targetMoved: true,
      newImageInstalled: true },
    cleanup: () => fs.rmSync(parent, { recursive: true, force: true }),
  };
}

test("native restore IPC never deletes the installed image before verified rollback exists", () => {
  assert.match(restore, /await reconcileFailedSqliteRestore\(/);
  assert.doesNotMatch(restore, /if \(targetMoved && fs\.existsSync\(target\)\) fs\.unlinkSync\(target\)/);
  assert.match(restore, /!recovery\.keepJournal/);
  assert.match(restore, /const priorStateRestored = recovery\.priorStateRestored/);
});

test("missing rollback preserves the only surviving installed image and journal", async () => {
  const f = fixture("missing");
  try {
    fs.writeFileSync(f.target, "good new customer data");
    const r = await reconcileFailedSqliteRestore(f.state, valid);
    assert.equal(r.priorStateRestored, false);
    assert.equal(r.keepJournal, true);
    assert.match(r.rollbackError, /missing/);
    assert.equal(fs.readFileSync(f.target, "utf8"), "good new customer data");
    assert.ok(fs.existsSync(path.join(f.stageDirectory, "restore-journal.json")));
  } finally { f.cleanup(); }
});

test("invalid rollback must not replace or delete a valid installed image", async () => {
  const f = fixture("invalid");
  try {
    fs.writeFileSync(f.target, "good new customer data");
    fs.writeFileSync(f.rollback, "bad previous image");
    const r = await reconcileFailedSqliteRestore(f.state, valid);
    assert.equal(r.keepJournal, true);
    assert.match(r.rollbackError, /failed validation/);
    assert.equal(fs.readFileSync(f.target, "utf8"), "good new customer data");
    assert.equal(fs.readFileSync(f.rollback, "utf8"), "bad previous image");
  } finally { f.cleanup(); }
});

test("validated previous image is reinstalled; failed installed image only removed after success", async () => {
  const f = fixture("valid");
  try {
    fs.writeFileSync(f.target, "good new customer data");
    fs.writeFileSync(f.rollback, "good previous customer data");
    const r = await reconcileFailedSqliteRestore(f.state, valid);
    assert.deepEqual(r, { priorStateRestored: true, rollbackError: null, keepJournal: false });
    assert.equal(fs.readFileSync(f.target, "utf8"), "good previous customer data");
    assert.equal(fs.existsSync(path.join(f.stageDirectory, "failed-installed.db")), false);
    assert.equal(fs.existsSync(f.rollback), false);
  } finally { f.cleanup(); }
});

test("rollback rename failure rescues installed image instead of losing both copies", async () => {
  const f = fixture("rename");
  try {
    fs.writeFileSync(f.target, "good new customer data");
    fs.writeFileSync(f.rollback, "good previous customer data");
    const io = { ...fs, renameSync(source, dest) {
      if (source === f.rollback) throw Error("simulated disk rename failure");
      return fs.renameSync(source, dest);
    }};
    const r = await reconcileFailedSqliteRestore(f.state, valid, io);
    assert.equal(r.keepJournal, true);
    assert.match(r.rollbackError, /simulated disk rename failure/);
    assert.equal(fs.readFileSync(f.target, "utf8"), "good new customer data");
    assert.equal(fs.readFileSync(f.rollback, "utf8"), "good previous customer data");
  } finally { f.cleanup(); }
});

test("evidence-delete failure preserves journal and both validated images", async () => {
  const f = fixture("evidence");
  try {
    fs.writeFileSync(f.target, "good new customer data");
    fs.writeFileSync(f.rollback, "good previous customer data");
    const io = { ...fs, unlinkSync(filename) {
      if (filename.endsWith("failed-installed.db")) throw Error("disk read-only");
      return fs.unlinkSync(filename);
    }};
    const r = await reconcileFailedSqliteRestore(f.state, valid, io);
    assert.equal(r.priorStateRestored, true);
    assert.equal(r.keepJournal, true);
    assert.match(r.rollbackError, /evidence could not be removed/);
    assert.equal(fs.readFileSync(f.target, "utf8"), "good previous customer data");
    assert.equal(fs.readFileSync(path.join(f.stageDirectory, "failed-installed.db"), "utf8"),
      "good new customer data");
  } finally { f.cleanup(); }
});

test("fresh failed install with no prior image is retained for explicit review", async () => {
  const f = fixture("fresh");
  try {
    fs.writeFileSync(f.target, "good first customer database");
    const r = await reconcileFailedSqliteRestore({ ...f.state,
      hadTarget: false, targetMoved: false, newImageInstalled: true }, valid);
    assert.equal(r.priorStateRestored, false);
    assert.equal(r.keepJournal, true);
    assert.match(r.rollbackError, /manual recovery/);
    assert.equal(fs.readFileSync(f.target, "utf8"), "good first customer database");
  } finally { f.cleanup(); }
});

test("symlink rollback is refused without modifying the live image", async () => {
  const f = fixture("link");
  try {
    fs.writeFileSync(f.target, "good new customer data");
    const other = path.join(f.parent, "external.db");
    fs.writeFileSync(other, "good external data");
    fs.symlinkSync(other, f.rollback);
    const r = await reconcileFailedSqliteRestore(f.state, valid);
    assert.equal(r.keepJournal, true);
    assert.match(r.rollbackError, /not a regular file/);
    assert.equal(fs.readFileSync(f.target, "utf8"), "good new customer data");
    assert.equal(fs.readFileSync(other, "utf8"), "good external data");
  } finally { f.cleanup(); }
});
