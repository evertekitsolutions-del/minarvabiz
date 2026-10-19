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
  }).outputText, filename,
);

const { backupActionMessage } = require("../../../ui/src/components/backup/backup-action-message.ts");
const panel = fs.readFileSync("packages/ui/src/components/backup/BackupPanel.tsx", "utf8");
const web = fs.readFileSync("apps/web/src/app/(app)/backup/page.tsx", "utf8");

test("cancelled manual/automatic/restore operations never show a false success", () => {
  assert.equal(backupActionMessage(null, "Backup created"), "Operation cancelled.");
  assert.equal(backupActionMessage(null, "Restore completed"), "Operation cancelled.");
  assert.equal(backupActionMessage(undefined, "Backup created"), "Backup created");
  assert.equal(backupActionMessage("Restore successful. Close and reopen Minarva Biz manually.", "Restore completed"),
    "Restore successful. Close and reopen Minarva Biz manually.");
  assert.match(panel, /const outcome = await action\(\)/);
  assert.match(panel, /setMessage\(backupActionMessage\(outcome, success\)\)/);
  assert.match(panel, /if \(outcome !== null\) await refreshNative\(\)/);
  assert.match(panel, /if \(r\.cancelled\) return null/g);
  assert.match(panel, /window\.confirm\("Restore a backup\?/);
  assert.match(panel, /Close and reopen Minarva Biz manually\./);
});

test("non-admin backup panel cannot load, display, inspect or export native metadata", () => {
  assert.match(panel, /if \(!canManage \|\| !native\?\.listBackups\)/);
  assert.match(panel, /const backups = canManage \? \(nativeBackups \?\? fallbackBackups\) : \[\]/);
  assert.match(panel, /Backup details require backup-management permission/);
  assert.match(panel, /if \(!canManage\) \{\s*setMessage\("Backup management permission is required\."\)/);
  assert.doesNotMatch(panel, /refreshed\?\.find\(\(item\) => item\.id === backup\.id\) \?\? backup/,
    "stale metadata must not masquerade as a new verification");
  assert.match(panel, /Cannot verify: the current native backup list is unavailable/);
  assert.match(panel, /Cannot inspect: the current native backup list is unavailable/);
});

test("Web audit tab and privileged record reads are role-gated, even after tab changes", () => {
  assert.match(web, /if \(!can\("backup\.manage"\)\) \{\s*setBackups\(\[\]\);\s*setLogs\(\[\]\);/);
  assert.match(web, /\{can\("backup\.manage"\) && <button/);
  assert.match(web, /tab === "audit" && can\("backup\.manage"\) && <AuditLogList logs=\{logs\} \/>/);
  assert.match(web, /canManage=\{can\("backup\.manage"\)\}/);
});
