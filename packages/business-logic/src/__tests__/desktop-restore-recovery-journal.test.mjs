import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createRequire } from 'node:module';

const main = fs.readFileSync('apps/desktop/electron/main.ts', 'utf8');
const restore = main.slice(main.indexOf('ipcMain.handle("backup:restoreFromFile"'), main.indexOf('ipcMain.handle("printer:list"'));
assert.ok(main.indexOf('recoverSqliteRestoreAtStartup(sqlitePath(), minarvaSqliteValidationError)') < main.indexOf('createWindow();'),
  'Restore recovery must complete before the first renderer boot');
assert.ok(restore.indexOf('beginSqliteRestoreJournal(stage, target)') < restore.indexOf('fs.renameSync(target, rollback)'),
  'Journal must be persisted before moving the last live SQLite image');
assert.match(restore, /sqliteRestoreReviewRequired/, 'Pending recovery workspaces must block subsequent restores');
assert.match(restore, /newImageInstalled = true/, 'Restore must track the installed stage for a fresh database');
assert.match(restore, /!hadTarget && newImageInstalled && fs\.existsSync\(target\)/, 'Failed fresh restore must not leave an unvalidated live image');
assert.match(restore, /const priorStateRestored = hadTarget/, 'Journal cleanup must wait until the prior database state is restored');
const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(
  fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText, file);
const { beginSqliteRestoreJournal, clearSqliteRestoreJournal, recoverSqliteRestoreAtStartup } =
  require('../../../../apps/desktop/electron/sqlite-restore-recovery.ts');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'minarva-restore-journal-'));
const valid = async file => fs.readFileSync(file, 'utf8').startsWith('valid') ? null : 'invalid test image';
const state = label => {
  const parent = path.join(dir, label); fs.mkdirSync(parent);
  const target = path.join(parent, 'minarvabiz.db');
  const directory = fs.mkdtempSync(path.join(parent, '.minarva-restore-'));
  return { target, stage: { directory, rollback: path.join(directory, 'rollback.db'), temp: path.join(directory, 'staged.db') } };
};
try {
  {
    const {target,stage} = state('during-swap');
    fs.writeFileSync(target,'valid old'); fs.writeFileSync(stage.temp,'valid new');
    beginSqliteRestoreJournal(stage,target);
    assert.match(fs.readFileSync(path.join(stage.directory,'restore-journal.json'),'utf8'),/"hadTarget":true/);
    fs.renameSync(target,stage.rollback);
    const r = await recoverSqliteRestoreAtStartup(target,valid);
    assert.deepEqual(r,{ok:true,recovered:true,retainedWorkspaces:1});
    assert.equal(fs.readFileSync(target,'utf8'),'valid old');
    assert.ok(fs.existsSync(path.join(stage.directory,'restore-journal.json')));
    assert.deepEqual(await recoverSqliteRestoreAtStartup(target,valid), {ok:true,recovered:false,retainedWorkspaces:1});
  }
  {
    const {target,stage} = state('after-install');
    fs.writeFileSync(target,'valid old'); fs.writeFileSync(stage.temp,'valid new');
    beginSqliteRestoreJournal(stage,target);
    fs.renameSync(target,stage.rollback); fs.renameSync(stage.temp,target);
    const r = await recoverSqliteRestoreAtStartup(target,valid);
    assert.equal(r.ok,true); assert.equal(r.recovered,false);
    assert.equal(fs.readFileSync(target,'utf8'),'valid new');
    assert.equal(fs.readFileSync(stage.rollback,'utf8'),'valid old');
  }
  {
    const {target,stage} = state('corrupt-live');
    fs.writeFileSync(target,'valid old'); beginSqliteRestoreJournal(stage,target);
    fs.renameSync(target,stage.rollback); fs.writeFileSync(target,'bad new');
    const r = await recoverSqliteRestoreAtStartup(target,valid);
    assert.equal(r.ok,false); assert.equal(fs.readFileSync(target,'utf8'),'bad new');
    assert.equal(fs.readFileSync(stage.rollback,'utf8'),'valid old');
  }
  {
    const {target,stage} = state('invalid-rollback');
    fs.writeFileSync(target,'valid old'); beginSqliteRestoreJournal(stage,target);
    fs.renameSync(target,stage.rollback); fs.writeFileSync(stage.rollback,'bad rollback');
    const r = await recoverSqliteRestoreAtStartup(target,valid);
    assert.equal(r.ok,false); assert.equal(fs.existsSync(target),false);
  }
  {
    const {target} = state('missing-journal'); fs.writeFileSync(target,'valid old');
    const r = await recoverSqliteRestoreAtStartup(target,valid);
    assert.equal(r.ok,false); assert.equal(fs.readFileSync(target,'utf8'),'valid old');
  }
  {
    const {target,stage} = state('wrong-target'); fs.writeFileSync(target,'valid old');
    fs.writeFileSync(path.join(stage.directory,'restore-journal.json'),'{"version":1,"targetName":"other.db","hadTarget":true}');
    const r = await recoverSqliteRestoreAtStartup(target,valid); assert.equal(r.ok,false);
  }
  {
    const {target,stage} = state('no-original'); fs.writeFileSync(stage.temp,'valid new');
    beginSqliteRestoreJournal(stage,target);
    const r = await recoverSqliteRestoreAtStartup(target,valid);
    assert.equal(r.ok,false); assert.equal(fs.existsSync(target),false);
    clearSqliteRestoreJournal(stage);
    assert.equal(fs.existsSync(path.join(stage.directory,'restore-journal.json')),false);
  }
  {
    const {target,stage} = state('multiple'); fs.writeFileSync(target,'valid old');
    beginSqliteRestoreJournal(stage,target);
    const other = fs.mkdtempSync(path.join(path.dirname(target), '.minarva-restore-'));
    beginSqliteRestoreJournal({ directory:other, temp:path.join(other,'staged.db'), rollback:path.join(other,'rollback.db') },target);
    const r = await recoverSqliteRestoreAtStartup(target,valid); assert.equal(r.ok,false);
  }
  {
    const {target,stage} = state('symlink-journal'); fs.writeFileSync(target,'valid old');
    const other = path.join(path.dirname(target),'untrusted.txt'); fs.writeFileSync(other,'{"version":1,"targetName":"minarvabiz.db","hadTarget":true}');
    fs.symlinkSync(other,path.join(stage.directory,'restore-journal.json'));
    const r = await recoverSqliteRestoreAtStartup(target,valid); assert.equal(r.ok,false);
  }
  console.log('Windows restore journal startup crash-window/rollback/no-overwrite regression tests PASS');
} finally { fs.rmSync(dir,{recursive:true,force:true}); }
