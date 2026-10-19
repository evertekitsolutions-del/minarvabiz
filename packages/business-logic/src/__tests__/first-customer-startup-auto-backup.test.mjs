import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  filename,
);

const { runStartupAutomaticBackup } = require("../../../../apps/desktop/src/lib/startup-auto-backup.ts");
const bootstrap = fs.readFileSync("apps/desktop/src/lib/sqlite-bootstrap.ts", "utf8");

test("first durable SQLite write gates automatic backup startup", () => {
  const init = bootstrap.slice(bootstrap.indexOf("async function initializeDesktopSqlite()"),
    bootstrap.indexOf("export async function persistDomainToSqlite()"));
  const saved = init.indexOf("const persisted = await persistDomainToSqlite()");
  const rejected = init.indexOf("if (!persisted)", saved);
  const backup = init.indexOf("void runStartupAutomaticBackup(", saved);
  assert.ok(saved >= 0 && rejected > saved && backup > rejected);
  assert.match(init.slice(rejected, backup), /throw new Error/);
  assert.match(init.slice(rejected, backup), /if \(shouldRunAutoBackup\(\) && api\.createAutomaticBackup\)/);
  assert.doesNotMatch(init.slice(0, saved), /runStartupAutomaticBackup\(/);
});

test("startup backup acknowledges only a verified native path", async () => {
  const successes = [], failures = [];
  await runStartupAutomaticBackup(
    async () => ({ ok: true, path: "D:/Minarva Biz Backups/valid.db", sizeBytes: 900 }),
    (path, bytes) => successes.push({ path, bytes }),
    reason => failures.push(reason),
  );
  assert.deepEqual(successes, [{ path: "D:/Minarva Biz Backups/valid.db", bytes: 900 }]);
  assert.deepEqual(failures, []);

  await runStartupAutomaticBackup(
    async () => ({ ok: true }),
    () => { throw new Error("No backup path may be accepted"); },
    reason => failures.push(reason),
  );
  assert.match(failures.at(-1), /no verified file/i);
});

test("native rejection and synchronous throw are captured without unhandled rejection", async () => {
  const failures = [];
  for (const create of [
    () => Promise.reject(new Error("SQLite gate unavailable")),
    () => { throw new Error("IPC unavailable"); },
    async () => ({ ok: false, error: "Backup validation failed" }),
  ]) {
    await assert.doesNotReject(runStartupAutomaticBackup(create, () => {
      throw new Error("must not report success");
    }, msg => failures.push(msg)));
  }
  assert.deepEqual(failures, [
    "SQLite gate unavailable", "IPC unavailable", "Backup validation failed",
  ]);
});

test("cancelled backup does not signal either success or failure", async () => {
  let callbacks = 0;
  await runStartupAutomaticBackup(async () => ({ ok: false, cancelled: true }),
    () => callbacks++, () => callbacks++);
  assert.equal(callbacks, 0);
});

test("metadata callback exceptions become reported failures, not unhandled promise rejections", async () => {
  let reported = "";
  await assert.doesNotReject(runStartupAutomaticBackup(
    async () => ({ ok: true, path: "valid.db" }),
    () => { throw new Error("storage quota exhausted"); },
    msg => { reported = msg; },
  ));
  assert.match(reported, /metadata could not be recorded: storage quota exhausted/);
});
