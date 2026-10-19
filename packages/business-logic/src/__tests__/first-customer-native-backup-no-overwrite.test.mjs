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
const { copySqliteBackupExclusive, sqliteBackupCopyError, uniqueSqliteBackupFilename } =
  require("../../../../apps/desktop/electron/sqlite-backup-copy.ts");

const main = fs.readFileSync("apps/desktop/electron/main.ts", "utf8");
const block = main.slice(main.indexOf("async function createLocalBackup("),
  main.indexOf("function pruneAutomaticBackups("));
const manual = main.slice(main.indexOf('ipcMain.handle("backup:createManual"'),
  main.indexOf('ipcMain.handle("backup:export"'));
const exporter = main.slice(main.indexOf('ipcMain.handle("backup:export"'),
  main.indexOf('ipcMain.handle("backup:chooseDestination"'));

test("production manual/export/automatic copies never overwrite an existing backup", () => {
  assert.match(main, /function copySqlite\(source: string, destination: string\) \{ return copySqliteBackupExclusive\(source, destination\); \}/);
  assert.match(block, /uniqueSqliteBackupFilename\(kind, timestamp\(\)\)/);
  assert.match(block, /let createdByThisCall = false/);
  assert.match(block, /createdByThisCall = true/);
  assert.match(block, /if \(createdByThisCall\) \{ try \{ fs\.unlinkSync\(destination\)/);
  assert.doesNotMatch(block, /if \(fs\.existsSync\(destination\)\) fs\.unlinkSync\(destination\)/);
  assert.match(manual, /copySqlite\(internal\.path, result\.filePath\)/);
  assert.match(exporter, /copySqlite\(resolved\.file, result\.filePath\)/);
  assert.match(manual, /sqliteBackupCopyError\(error\)/);
  assert.match(exporter, /sqliteBackupCopyError\(error\)/);
  assert.match(main, /await minarvaSqliteValidationError\(destination\)/);
});

test("rapid internal backups of same timestamp have unique filenames", () => {
  const when = "2026-10-19T10-10-10-000Z";
  for (const kind of ["manual", "automatic", "pre-restore", "pre-update"]) {
    const filenames = new Set(Array.from({ length: 64 },
      () => uniqueSqliteBackupFilename(kind, when)));
    assert.equal(filenames.size, 64);
    for (const name of filenames) {
      assert.match(name, new RegExp("^minarvabiz-" + kind + "-2026-10-19T10-10-10-000Z-[0-9a-f-]{36}\\.db$"));
    }
  }
});

test("existing customer backup, self-export and existing symlink remain intact", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "minarva-backup-exclusive-"));
  try {
    const old = path.join(folder, "previous-customer.db");
    const current = path.join(folder, "current.db");
    fs.writeFileSync(old, "valuable previous customer backup");
    fs.writeFileSync(current, "new local SQLite image");
    const beforeOld = fs.readFileSync(old);
    assert.throws(() => copySqliteBackupExclusive(current, old), /EEXIST/);
    assert.deepEqual(fs.readFileSync(old), beforeOld);
    assert.throws(() => copySqliteBackupExclusive(current, current), /source backup/i);
    assert.equal(fs.readFileSync(current, "utf8"), "new local SQLite image");
    if (process.platform !== "win32") {
      const link = path.join(folder, "linked.db");
      fs.symlinkSync(old, link);
      assert.throws(() => copySqliteBackupExclusive(current, link), /EEXIST/);
      assert.deepEqual(fs.readFileSync(old), beforeOld);
    }
    const newPath = path.join(folder, uniqueSqliteBackupFilename("manual", "2026-10-19T10-00-00-000Z"));
    assert.equal(copySqliteBackupExclusive(current, newPath), fs.statSync(current).size);
    assert.deepEqual(fs.readFileSync(newPath), fs.readFileSync(current));
    assert.deepEqual(fs.readFileSync(old), beforeOld);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test("exclusive refusal cannot trigger cleanup of someone else's original file", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "minarva-backup-fault-"));
  try {
    const src = path.join(folder, "src.db"), existing = path.join(folder, "customer.db");
    fs.writeFileSync(src, "new");
    fs.writeFileSync(existing, "old");
    let flag;
    const io = { ...fs, copyFileSync(source, destination, options) {
      flag = options;
      return fs.copyFileSync(source, destination, options);
    }};
    assert.throws(() => copySqliteBackupExclusive(src, existing, io), /EEXIST/);
    assert.equal(flag, fs.constants.COPYFILE_EXCL);
    assert.equal(fs.readFileSync(existing, "utf8"), "old");
    assert.equal(fs.readdirSync(folder).length, 2);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test("customer sees distinct-filename guidance without losing the prior backup", () => {
  assert.match(sqliteBackupCopyError(Object.assign(new Error("EEXIST"), { code: "EEXIST" })),
    /another filename.*not changed/i);
  assert.equal(sqliteBackupCopyError(new Error("disk full")), "disk full");
});
