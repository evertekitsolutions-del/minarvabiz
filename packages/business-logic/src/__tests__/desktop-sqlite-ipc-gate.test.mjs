import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(module,filename)=>module._compile(
  ts.transpileModule(fs.readFileSync(filename,"utf8"),{
    fileName:filename,compilerOptions:{
      module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
      esModuleInterop:true
    }
  }).outputText,filename);
const {NativeSqliteBusyError,NativeSqliteIpcGate}=require(
  "../../../../apps/desktop/electron/sqlite-ipc-gate.ts");

const gate=new NativeSqliteIpcGate();
const folder=fs.mkdtempSync(path.join(os.tmpdir(),"minarva-ipc-gate-"));
const database=path.join(folder,"minarvabiz.db");
const read=()=>fs.readFileSync(database,"utf8");
const write=(text)=>gate.write(()=>{fs.writeFileSync(database,text);return true;});
const deferred=()=>{
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no});
  return {promise,resolve,reject};
};
try{
  assert.equal(gate.activeReservation,null);
  assert.equal(write("original"),true);
  assert.equal(gate.read(read),"original");

  const restoreBlock=deferred();
  const restoring=gate.reserve("restore",async()=>{
    assert.equal(gate.activeReservation,"restore");
    await restoreBlock.promise;
    fs.writeFileSync(database,"newly restored");
    return "restored";
  });
  assert.equal(gate.activeReservation,"restore");
  let callbackCount=0;
  assert.equal(gate.write(()=>{callbackCount++;return true;}),false,
    "A busy write must never execute the callback or acknowledge success");
  assert.equal(callbackCount,0);
  assert.throws(()=>gate.read(read),NativeSqliteBusyError,
    "Read must not return false-empty database during in-progress rename");
  await assert.rejects(gate.reserve("restore",()=>true),NativeSqliteBusyError);
  await assert.rejects(gate.reserve("backup",()=>true),NativeSqliteBusyError);
  assert.equal(read(),"original","Restore cannot be interleaved by another IPC call");
  restoreBlock.resolve();
  assert.equal(await restoring,"restored");
  assert.equal(gate.read(read),"newly restored");
  assert.equal(gate.activeReservation,null);
  assert.equal(write("after restore"),true);

  const backupBlock=deferred();
  const backingUp=gate.reserve("backup",async()=>{
    // Read the exact live file while native database writes are fenced.
    const original=read();
    await backupBlock.promise;
    assert.equal(read(),original,"Backup source remains consistent across awaits");
    return original;
  });
  assert.equal(gate.activeReservation,"backup");
  assert.equal(gate.read(read),"after restore",
    "Only restore must block reads; snapshot backup may read live DB");
  assert.equal(write("forbidden during backup"),false);
  await assert.rejects(gate.reserve("restore",()=>true),NativeSqliteBusyError);
  await assert.rejects(gate.reserve("backup",()=>true),NativeSqliteBusyError);
  backupBlock.resolve();
  assert.equal(await backingUp,"after restore");
  assert.equal(gate.activeReservation,null);

  // Failures must not strand the native DB in a permanent busy state.
  await assert.rejects(gate.reserve("restore",async()=>{
    await Promise.resolve();
    throw Error("Simulated rollback failure");
  }),/Simulated rollback failure/);
  assert.equal(gate.activeReservation,null);
  await assert.rejects(gate.reserve("backup",()=>Promise.reject(
    Error("Simulated disk-full snapshot"))),/disk-full/);
  assert.equal(gate.activeReservation,null);
  assert.equal(write("after errors"),true);
  assert.equal(gate.read(read),"after errors");
  assert.equal(gate.write(()=>false),false);
  assert.throws(()=>gate.write(()=>{throw Error("sqlite validation failed")}),
    /sqlite validation failed/);
  assert.equal(gate.activeReservation,null);
  await assert.rejects(gate.reserve("unknown",()=>true),/Unrecognized/);

  // Source contract ensures the gate is truly WIRED into production IPC.
  const source=fs.readFileSync("apps/desktop/electron/main.ts","utf8");
  assert.match(source,/const sqliteGate = new NativeSqliteIpcGate\(\)/);
  assert.match(source,/ipcMain\.handle\("db:readBinary"[\s\S]*?sqliteGate\.read\(\(\) =>/);
  assert.match(source,/ipcMain\.handle\("db:writeBinary"[\s\S]*?sqliteGate\.write\(\(\) => \{/);
  assert.match(source,/writeValidatedSqliteBinaryAtomically\([\s\S]*?sqliteFingerprintFence\.acceptCommittedImage\(data\)/);
  assert.match(source,/ipcMain\.handle\("db:exists"[\s\S]*?sqliteGate\.read\(\(\) =>/);
  assert.match(source,/ipcMain\.handle\("backup:createManual"[\s\S]*?sqliteGate\.reserve\("backup"/);
  assert.match(source,/ipcMain\.handle\("backup:createAutomatic"[\s\S]*?sqliteGate\.reserve\("backup"/);
  assert.match(source,/ipcMain\.handle\("backup:restoreFromFile"[\s\S]*?sqliteGate\.reserve\("restore"/);
  assert.match(source,/if \(error instanceof NativeSqliteBusyError\)/);
  assert.match(source,/requireTrustedRenderer\(event\)/);
  assert.match(source,/MAX_SQLITE_IPC_BYTES/);
  console.log("Native SQLite IPC gate: overlapping async restore/backup, write rejection, false-empty read refusal, failure release PASS");
}finally{
  fs.rmSync(folder,{recursive:true,force:true});
}
