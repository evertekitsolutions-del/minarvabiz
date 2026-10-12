import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createRequire } from 'node:module';
const main = fs.readFileSync('apps/desktop/electron/main.ts', 'utf8');
assert.match(main, /prepareSqliteRestoreStage\(source, target\)/,
  'Production restore must use exclusively allocated, fsynced staging');
const restore = main.slice(main.indexOf('ipcMain.handle("backup:restoreFromFile"'), main.indexOf('ipcMain.handle("printer:list"'));
assert.ok(restore.indexOf('prepareSqliteRestoreStage(source, target)') < restore.indexOf('fs.renameSync(target, rollback)'));
assert.ok(restore.indexOf('await minarvaSqliteValidationError(temp)') < restore.indexOf('fs.renameSync(target, rollback)'));
assert.match(restore, /finally \{\s*if \(stage\) cleanupSqliteRestoreStage\(stage\)/);
assert.match(restore, /sqliteGate\.reserve\("restore"/);
const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(
  fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText, file);
const { prepareSqliteRestoreStage, cleanupSqliteRestoreStage } = require('../../../../apps/desktop/electron/sqlite-restore-staging.ts');
const SQL = await require('sql.js')();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-staging-test-'));
try {
  const source = path.join(dir, 'source.db'), target = path.join(dir, 'live.db');
  const db = new SQL.Database(); db.run('CREATE TABLE evidence(value TEXT); INSERT INTO evidence VALUES (\'saved\')');
  const bytes = Buffer.from(db.export()); db.close();
  fs.writeFileSync(source, bytes); fs.writeFileSync(target, bytes);
  let syncs = 0;
  const a = prepareSqliteRestoreStage(source, target, { ...fs, fsyncSync(fd) { syncs++; fs.fsyncSync(fd); } });
  const b = prepareSqliteRestoreStage(source, target);
  assert.notEqual(a.directory, b.directory);
  assert.equal(path.dirname(a.directory), dir);
  assert.equal(syncs, 1, 'Staging must be flushed before caller can move the live database');
  const reopened = new SQL.Database(fs.readFileSync(a.temp));
  assert.equal(reopened.exec('SELECT value FROM evidence')[0].values[0][0], 'saved'); reopened.close();
  assert.deepEqual(fs.readFileSync(target), bytes);
  // Failed rollback must remain available: cleanup is NEVER recursive.
  fs.writeFileSync(a.rollback, bytes);
  cleanupSqliteRestoreStage(a);
  assert.deepEqual(fs.readFileSync(a.rollback), bytes);
  assert.equal(fs.existsSync(a.temp), false);
  fs.unlinkSync(a.rollback); cleanupSqliteRestoreStage(a);
  assert.equal(fs.existsSync(a.directory), false);
  cleanupSqliteRestoreStage(b);
  for (const operation of ['copyFileSync', 'openSync', 'fsyncSync', 'closeSync']) {
    const io = { ...fs, [operation](...args) {
      if (operation === 'copyFileSync') fs.writeFileSync(args[1], 'partial');
      if (operation === 'closeSync') { fs.closeSync(args[0]); }
      throw Error('simulated ' + operation + ' failure');
    } };
    assert.throws(() => prepareSqliteRestoreStage(source, target, io), /simulated/);
    assert.deepEqual(fs.readFileSync(target), bytes);
    assert.deepEqual(fs.readdirSync(dir).sort(), ['live.db', 'source.db']);
  }
  assert.throws(() => prepareSqliteRestoreStage(source, target, { ...fs,
    copyFileSync(src, dest, flags) {
      fs.writeFileSync(dest, 'preexisting');
      assert.equal(flags, fs.constants.COPYFILE_EXCL);
      fs.copyFileSync(src, dest, flags);
    }
  }), /EEXIST/);
  assert.deepEqual(fs.readFileSync(target), bytes);
  console.log('Exclusive restore staging: real SQLite reopen, unique paths, fsync, faults and rollback preservation PASS');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
