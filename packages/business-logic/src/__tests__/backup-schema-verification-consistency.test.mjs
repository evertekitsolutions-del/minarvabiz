import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync(new URL("../../../../apps/desktop/electron/main.ts", import.meta.url), "utf8");

assert.match(
  main,
  /async function minarvaSqliteValidationError\(file: string\): Promise<string \| null> \{ return sqliteValidationError\(file\) \|\| await minarvaBackupSchemaError\(file\); \}/
);

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

assert.match(listBlock, /await minarvaSqliteValidationError\(full\)/);
assert.match(listBlock, /verified: validationError === null/);

assert.match(manualBlock, /await minarvaSqliteValidationError\(source\)/);
assert.match(manualBlock, /await minarvaSqliteValidationError\(result\.filePath\)/);

assert.match(exportBlock, /await minarvaSqliteValidationError\(source\)/);
assert.match(exportBlock, /await minarvaSqliteValidationError\(result\.filePath\)/);

assert.match(automaticBlock, /await minarvaSqliteValidationError\(result\.path\)/);
assert.match(automaticBlock, /fs\.unlinkSync\(result\.path\)/);

assert.match(restoreBlock, /await minarvaSqliteValidationError\(source\)/);
assert.match(restoreBlock, /await minarvaSqliteValidationError\(temp\)/);
assert.match(restoreBlock, /await minarvaSqliteValidationError\(target\)/);

assert.match(updateBlock, /await minarvaSqliteValidationError\(backup\.path\)/);
assert.match(updateBlock, /verified Minarva Biz pre-update database backup/);

console.log("Backup schema-verification consistency contract tests passed");
