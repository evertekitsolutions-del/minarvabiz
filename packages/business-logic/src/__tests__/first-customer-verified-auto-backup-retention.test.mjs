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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename,
);
const { pruneVerifiedAutomaticBackups } =
  require("../../../../apps/desktop/electron/sqlite-backup-retention.ts");
const main = fs.readFileSync("apps/desktop/electron/main.ts", "utf8");

function fixture() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "minarva-autobackup-retention-"));
  function create(name, text, hour) {
    const file = path.join(folder, "minarvabiz-automatic-" + name + ".db");
    fs.writeFileSync(file, text);
    const time = new Date(Date.UTC(2026, 9, 19, hour));
    fs.utimesSync(file, time, time);
    return file;
  }
  return { folder, create, cleanup: () => fs.rmSync(folder, { recursive: true, force: true }) };
}
const verify = async file => fs.readFileSync(file, "utf8").startsWith("good ")
  ? null : "Invalid Minarva Biz SQLite image";

test("latest corrupted backups cannot evict the sole healthy customer recovery copy", async () => {
  const f = fixture();
  try {
    const good = f.create("valid", "good paid customer data", 7);
    const bad1 = f.create("damaged-1", "corrupt new backup", 8);
    const bad2 = f.create("damaged-2", "corrupt newer backup", 9);
    const result = await pruneVerifiedAutomaticBackups(f.folder, 1, verify);
    assert.deepEqual(result, { pruned: 0, retainedUnverified: 2 });
    assert.equal(fs.readFileSync(good, "utf8"), "good paid customer data");
    assert.ok(fs.existsSync(bad1), "Invalid backup is retained for support diagnosis");
    assert.ok(fs.existsSync(bad2));
  } finally { f.cleanup(); }
});

test("retention counts verified backups only and removes only excess verified files", async () => {
  const f = fixture();
  try {
    const old = f.create("old-valid", "good oldest recovery", 5);
    const recent = f.create("new-valid", "good newer recovery", 7);
    const latest = f.create("latest-valid", "good latest recovery", 8);
    const invalid = f.create("invalid", "invalid evidence", 9);
    const unrelated = path.join(f.folder, "minarvabiz-manual-external.db");
    fs.writeFileSync(unrelated, "manual customer evidence");
    const result = await pruneVerifiedAutomaticBackups(f.folder, 2, verify);
    assert.deepEqual(result, { pruned: 1, retainedUnverified: 1 });
    assert.equal(fs.existsSync(old), false);
    assert.ok(fs.existsSync(recent));
    assert.ok(fs.existsSync(latest));
    assert.ok(fs.existsSync(invalid));
    assert.equal(fs.readFileSync(unrelated, "utf8"), "manual customer evidence");
  } finally { f.cleanup(); }
});

test("failed validator, symlink, changed contents and deletion faults all fail closed", async () => {
  const f = fixture();
  try {
    const prior = f.create("prior", "good customer snapshot", 5);
    const current = f.create("current", "good latest customer snapshot", 8);
    const unreadable = f.create("unreadable", "good preserved snapshot", 9);
    const external = path.join(f.folder, "external.db");
    fs.writeFileSync(external, "good outside customer data");
    let symlink;
    try {
      symlink = path.join(f.folder, "minarvabiz-automatic-link.db");
      fs.symlinkSync(external, symlink);
    } catch { symlink = null; }

    const calls = new Map();
    const injected = async file => {
      if (file === unreadable) throw new Error("I/O failure");
      const count = (calls.get(file) ?? 0) + 1;
      calls.set(file, count);
      if (file === prior && count === 2) {
        fs.writeFileSync(prior, "broken during verification");
        return "concurrent modification";
      }
      return verify(file);
    };
    const result = await pruneVerifiedAutomaticBackups(f.folder, 1, injected);
    assert.equal(result.pruned, 0);
    assert.ok(result.retainedUnverified >= 1);
    assert.ok(fs.existsSync(prior));
    assert.ok(fs.existsSync(current));
    assert.ok(fs.existsSync(unreadable));
    assert.equal(fs.readFileSync(external, "utf8"), "good outside customer data");
    if (symlink) assert.ok(fs.lstatSync(symlink).isSymbolicLink());
  } finally { f.cleanup(); }
});

test("invalid retention values never remove every verified recovery image", async () => {
  for (const retention of [0, -10, NaN, Infinity]) {
    const f = fixture();
    try {
      const good = f.create("good", "good customer ledger", 5);
      const result = await pruneVerifiedAutomaticBackups(f.folder, retention, verify);
      assert.equal(result.pruned, 0);
      assert.ok(fs.existsSync(good));
    } finally { f.cleanup(); }
  }
});

test("production IPC runs verified prune inside exclusive backup reservation", () => {
  const wrapper = main.slice(main.indexOf("async function pruneAutomaticBackups("),
    main.indexOf("async function listBackupFiles("));
  const automatic = main.slice(main.indexOf('ipcMain.handle("backup:createAutomatic"'),
    main.indexOf('ipcMain.handle("backup:restoreFromFile"'));
  assert.match(wrapper, /pruneVerifiedAutomaticBackups\(targetDir, retention, minarvaSqliteValidationError\)/);
  assert.match(automatic, /await pruneAutomaticBackups\(Number\.isFinite\(retention\)/);
  assert.match(automatic, /sqliteGate\.reserve\("backup", async \(\) => \{/g);
  assert.match(automatic, /ipcMain\.handle\("backup:pruneAutomatic", async/);
  assert.doesNotMatch(wrapper, /files\.slice\(safeRetention\)/);
});
