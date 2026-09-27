import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const main = read("apps/desktop/electron/main.ts");
const preload = read("apps/desktop/electron/preload.ts");
const bootstrap = read("apps/desktop/src/lib/sqlite-bootstrap.ts");
const desktop = read("apps/desktop/src/App.tsx");
const web = read("apps/web/src/app/(app)/backup/page.tsx");
const panel = read("packages/ui/src/components/backup/BackupPanel.tsx");
const types = read("packages/types/src/index.ts");

for (const kind of ["pre-restore", "pre-update"]) {
  assert.equal(types.includes(kind), true, `BackupMeta must include ${kind}`);
  assert.equal(preload.includes(kind), true, `Desktop bridge must include ${kind}`);
}

assert.match(main, /function backupIdFor/);
assert.match(main, /function resolveBackupId/);
assert.match(main, /backupDestinationDir\(\)/);
assert.match(main, /await createLocalBackup\("manual"\)/);
assert.match(main, /await createLocalBackup\("automatic"\)/);
assert.match(main, /await createLocalBackup\("pre-restore"\)/);
assert.match(main, /await createLocalBackup\("pre-update"\)/);
assert.match(main, /pruneAutomaticBackups\(Number\.isFinite\(retention\)/);

assert.match(preload, /createAutomaticBackup: \(retention\?: number\)/);
assert.match(bootstrap, /createAutomaticBackup\(getAutoBackupSettings\(\)\.retentionCount\)/);
assert.match(desktop, /createAutomaticBackup\(settings\.retentionCount\)/);
assert.match(desktop, /canManage=\{can\("backup\.manage"\)\}/);
assert.match(web, /canManage=\{can\("backup\.manage"\)\}/);

assert.match(panel, /window\.confirm\("Restore a backup\?/);
assert.match(panel, /verified safety backup of the current database/);
assert.match(panel, /canManage = true/);
assert.match(panel, /retentionCount = 14/);
assert.match(panel, /createAutomaticBackup\(retentionCount\)/);
assert.match(panel, /Valid Minarva Biz SQLite backup/);

console.log("Professional backup/restore contract PASS");
