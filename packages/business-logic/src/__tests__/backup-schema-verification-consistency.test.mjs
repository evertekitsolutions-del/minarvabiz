import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync(new URL("../../../../apps/desktop/electron/main.ts", import.meta.url), "utf8");

assert.match(
  main,
  /async function minarvaSqliteValidationError\(file: string\): Promise<string \| null> \{ return sqliteValidationError\(file\) \|\| await minarvaBackupSchemaError\(file\); \}/
);
assert.match(main, /type LocalBackupKind = "manual" \| "automatic" \| "pre-restore" \| "pre-update"/);
assert.match(main, /async function createLocalBackup\(kind: LocalBackupKind\)/);
assert.match(main, /const sourceError = await minarvaSqliteValidationError\(source\)/);
assert.match(main, /const validationError = await minarvaSqliteValidationError\(destination\)/);
assert.match(main, /async function listBackupFiles\(\)/);
assert.match(main, /path\.resolve\(automaticDir\) !== path\.resolve\(internalDir\)/);
assert.match(main, /backupIdFor\(filename, location\.automaticStorage\)/);

function block(startNeedle, endNeedle) {
  const start = main.indexOf(startNeedle);
  const end = main.indexOf(endNeedle, start);
  assert.ok(start >= 0 && end > start, startNeedle + " block must exist");
  return main.slice(start, end);
}

const listBlock = block('ipcMain.handle("backup:list"', 'ipcMain.handle("backup:createManual"');
const manualBlock = block('ipcMain.handle("backup:createManual"', 'ipcMain.handle("backup:export"');
const exportBlock = block('ipcMain.handle("backup:export"', 'ipcMain.handle("backup:chooseDestination"');
const automaticBlock = block('ipcMain.handle("backup:createAutomatic"', 'ipcMain.handle("backup:pruneAutomatic"');
const restoreBlock = block('ipcMain.handle("backup:restoreFromFile"', 'ipcMain.handle("printer:list"');
const updateBlock = block('ipcMain.handle("update:install"', 'ipcMain.handle("app:relaunch"');

assert.match(listBlock, /return listBackupFiles\(\)/);

assert.match(manualBlock, /await createLocalBackup\("manual"\)/);
assert.match(manualBlock, /await minarvaSqliteValidationError\(result\.filePath\)/);
assert.match(manualBlock, /internalBackup: internal\.path/);

assert.match(exportBlock, /resolveBackupId\(id\)/);
assert.match(exportBlock, /await minarvaSqliteValidationError\(resolved\.file\)/);
assert.match(exportBlock, /await minarvaSqliteValidationError\(result\.filePath\)/);

assert.match(automaticBlock, /await createLocalBackup\("automatic"\)/);
assert.match(automaticBlock, /pruneAutomaticBackups/);

assert.match(restoreBlock, /await minarvaSqliteValidationError\(source\)/);
assert.match(restoreBlock, /await createLocalBackup\("pre-restore"\)/);
assert.match(restoreBlock, /Restore blocked because a verified pre-restore safety backup could not be created/);
assert.match(restoreBlock, /await minarvaSqliteValidationError\(temp\)/);
assert.match(restoreBlock, /await minarvaSqliteValidationError\(target\)/);
assert.match(restoreBlock, /Previous database was restored and revalidated/);

assert.match(updateBlock, /await createLocalBackup\("pre-update"\)/);
assert.match(updateBlock, /verified Minarva Biz pre-update database backup/);

console.log("Backup schema-verification consistency contract tests passed");
