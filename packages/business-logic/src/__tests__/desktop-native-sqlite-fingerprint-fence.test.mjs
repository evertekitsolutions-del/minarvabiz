import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, file) => module._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, file
);
const { NativeSqliteFingerprintFence, NativeSqliteExternalChangeError } =
  require("../../../../apps/desktop/electron/sqlite-fingerprint-fence.ts");
const { writeValidatedSqliteBinaryAtomically } =
  require("../../../../apps/desktop/electron/sqlite-native-atomic-write.ts");
const main = fs.readFileSync("apps/desktop/electron/main.ts", "utf8");
assert.match(main, /const sqliteFingerprintFence = new NativeSqliteFingerprintFence\(\)/);
const readIPC = main.slice(main.indexOf('ipcMain.handle("db:readBinary"'), main.indexOf('ipcMain.handle("db:writeBinary"'));
const writeIPC = main.slice(main.indexOf('ipcMain.handle("db:writeBinary"'), main.indexOf('ipcMain.handle("db:exists"'));
const existsIPC = main.slice(main.indexOf('ipcMain.handle("db:exists"'), main.indexOf('ipcMain.handle("trial:getState"'));
assert.match(readIPC, /sqliteGate\.read\(\(\) =>/);
assert.match(readIPC, /sqliteFingerprintFence\.observeRead\(image\)/);
assert.doesNotMatch(readIPC, /catch\s*\{\s*return null/);
assert.match(writeIPC, /sqliteGate\.write\(\(\) =>/);
assert.match(writeIPC, /sqliteFingerprintFence\.assertBeforeWrite\(readNativeSqliteImage\(\)\)/);
assert.match(writeIPC, /sqliteFingerprintFence\.acceptCommittedImage\(data\)/);
assert.match(existsIPC, /sqliteFingerprintFence\.observeRead\(image\)/);
assert.match(main, /if \(\(error as NodeJS\.ErrnoException\)\.code === "ENOENT"\) return null/);
assert.match(main, /sqliteFingerprintFence\.resetAfterRestore\(\)/);

const initSqlJs = require("sql.js");
const SQL = await initSqlJs();
const folder = fs.mkdtempSync(path.join(os.tmpdir(), "minarva-fingerprint-fence-"));
const target = path.join(folder, "minarvabiz.db");
const makeDb = (value) => {
  const db = new SQL.Database();
  db.run("CREATE TABLE orders (id INTEGER PRIMARY KEY, value TEXT NOT NULL)");
  db.run("INSERT INTO orders VALUES (1, ?)", [value]);
  const bytes = new Uint8Array(db.export());
  db.close();
  return bytes;
};
const old = makeDb("original customer order");
const external = makeDb("externally changed!!");
const saved = makeDb("newer renderer order");
const valid = (filename) => {
  const db = new SQL.Database(fs.readFileSync(filename));
  const result = db.exec("PRAGMA quick_check")[0]?.values[0][0];
  db.close();
  return result === "ok";
};
const fileBytes = () => fs.readFileSync(target);
const pending = () => fs.readdirSync(folder).filter((name) => name.includes(".pending-"));
try {
  const fence = new NativeSqliteFingerprintFence();
  assert.throws(() => fence.assertBeforeWrite(null), NativeSqliteExternalChangeError,
    "Writes must not be accepted before an authoritative renderer read");
  const initial = new NativeSqliteFingerprintFence();
  fs.writeFileSync(target, old);
  initial.observeRead(fileBytes());
  initial.observeRead(fileBytes());
  initial.assertBeforeWrite(fileBytes());
  const committed = writeValidatedSqliteBinaryAtomically(
    target, saved, valid, fs, () => initial.assertBeforeWrite(fileBytes())
  );
  assert.equal(committed, true);
  initial.acceptCommittedImage(saved);
  initial.observeRead(fileBytes());
  assert.deepEqual(fileBytes(), Buffer.from(saved));
  assert.deepEqual(pending(), []);

  // Same-length or timestamp-restored external changes must not be missed.
  assert.equal(old.byteLength, external.byteLength);
  const oldTimes = fs.statSync(target);
  fs.writeFileSync(target, external);
  fs.utimesSync(target, oldTimes.atime, oldTimes.mtime);
  assert.throws(() => initial.assertBeforeWrite(fileBytes()), NativeSqliteExternalChangeError);
  assert.throws(() => initial.observeRead(fileBytes()), NativeSqliteExternalChangeError);
  assert.deepEqual(fileBytes(), Buffer.from(external));
  // Reverting the external bytes is NOT allowed to clear a detected conflict.
  fs.writeFileSync(target, saved);
  assert.throws(() => initial.assertBeforeWrite(fileBytes()), NativeSqliteExternalChangeError);

  // New file appears after a genuinely empty first boot: refuse overwriting it.
  fs.unlinkSync(target);
  const empty = new NativeSqliteFingerprintFence();
  empty.observeRead(null);
  fs.writeFileSync(target, external);
  assert.throws(() => empty.assertBeforeWrite(fileBytes()), NativeSqliteExternalChangeError);
  assert.deepEqual(fileBytes(), Buffer.from(external));

  // An externally deleted previously observed image must not be re-seeded.
  const deleted = new NativeSqliteFingerprintFence();
  deleted.observeRead(fileBytes());
  fs.unlinkSync(target);
  assert.throws(() => deleted.assertBeforeWrite(null), NativeSqliteExternalChangeError);
  assert.equal(fs.existsSync(target), false);

  // Test the late check: another writer edits the DB AFTER the first check
  // while the staged file is being fsynced, BEFORE the rename.
  fs.writeFileSync(target, old);
  const during = new NativeSqliteFingerprintFence();
  during.observeRead(fileBytes());
  let injected = false;
  const injectedIo = {
    ...fs,
    fsyncSync(fd) {
      fs.fsyncSync(fd);
      if (!injected) {
        injected = true;
        fs.writeFileSync(target, external);
      }
    },
  };
  assert.equal(writeValidatedSqliteBinaryAtomically(
    target, saved, valid, injectedIo, () => during.assertBeforeWrite(fileBytes())
  ), false);
  assert.equal(injected, true);
  assert.deepEqual(fileBytes(), Buffer.from(external));
  assert.deepEqual(pending(), []);
  assert.throws(() => during.assertBeforeWrite(fileBytes()), NativeSqliteExternalChangeError);

  // A known successful, validated manual restore intentionally rebases the
  // fence, but a NEW read is required before any subsequent write.
  during.resetAfterRestore();
  assert.throws(() => during.assertBeforeWrite(fileBytes()), NativeSqliteExternalChangeError);
  const reloaded = new NativeSqliteFingerprintFence();
  reloaded.observeRead(fileBytes());
  assert.doesNotThrow(() => reloaded.assertBeforeWrite(fileBytes()));
  console.log("Native SQLite mutation fence: real SQLite, same-size/timestamp edits, lost/create, late-stage race, fail-closed and restore rebase PASS");
} finally {
  fs.rmSync(folder, { recursive: true, force: true });
}
