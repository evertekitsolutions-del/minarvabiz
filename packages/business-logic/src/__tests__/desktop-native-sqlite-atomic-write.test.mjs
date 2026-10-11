import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(module,file)=>module._compile(ts.transpileModule(
  fs.readFileSync(file,"utf8"),{fileName:file,compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
    esModuleInterop:true,
  }}).outputText,file);
const {writeValidatedSqliteBinaryAtomically}=require(
  "../../../../apps/desktop/electron/sqlite-native-atomic-write.ts");
const nativeMain=fs.readFileSync("apps/desktop/electron/main.ts","utf8");
assert.match(nativeMain,/requireTrustedRenderer\(event\);\s*if \(!\(data instanceof Uint8Array\)/,
  "SQLite IPC writer must retain trusted-renderer and size checks");
assert.match(nativeMain,/return sqliteGate\.write\(\(\) => writeValidatedSqliteBinaryAtomically\(sqlitePath\(\), data, isValidSqliteFile\)\)/,
  "Production IPC must call the tested native atomic writer");
assert.doesNotMatch(nativeMain,/\$\{file\}\.restore-\$\{process\.pid\}-\$\{Date\.now\(\)\}/,
  "Native IPC must not reuse timestamp-based staging names");
const initSqlJs=require("sql.js");
const SQL=await initSqlJs();
const folder=fs.mkdtempSync(path.join(os.tmpdir(),"minarva-atomic-sqlite-"));
const target=path.join(folder,"minarvabiz.db");
const bytes=(value)=>{
  const db=new SQL.Database();
  db.run("CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT NOT NULL)");
  db.run("INSERT INTO sample VALUES (1,?)",[value]);
  const image=new Uint8Array(db.export());
  db.close();
  return image;
};
const old=bytes("old paid customer state"),newer=bytes("new transaction"),next=bytes("subsequent save");
const read=()=>fs.readFileSync(target);
const readValue=()=>{
  const db=new SQL.Database(read());const result=db.exec("SELECT value FROM sample WHERE id=1");
  db.close();return result[0]?.values[0][0];
};
const validate=(candidate)=>{
  const db=new SQL.Database(fs.readFileSync(candidate));
  const integrity=db.exec("PRAGMA quick_check")[0]?.values[0][0];
  db.close();return integrity==="ok";
};
const clean=()=>fs.readdirSync(folder).filter(x=>x.includes(".pending-"));
try{
  fs.writeFileSync(target,old);
  assert.equal(readValue(),"old paid customer state");
  assert.equal(writeValidatedSqliteBinaryAtomically(target,newer,validate),true);
  assert.equal(readValue(),"new transaction");
  assert.deepEqual(clean(),[],"No pending files remain after commit");
  assert.equal(writeValidatedSqliteBinaryAtomically(target,next,validate),true,
    "Rapid second call must use a new UUID-based temp");
  assert.equal(readValue(),"subsequent save");
  assert.deepEqual(clean(),[]);

  // A malformed/partial database image can never replace a good file.
  assert.equal(writeValidatedSqliteBinaryAtomically(target,new Uint8Array([1,2,3]),candidate=>{
    const magic=fs.readFileSync(candidate).subarray(0,16).toString("ascii");
    return magic==="SQLite format 3\0";
  }),false);
  assert.equal(readValue(),"subsequent save");
  assert.deepEqual(clean(),[]);
  assert.equal(writeValidatedSqliteBinaryAtomically(target,newer,()=>{
    throw Error("Simulated validation failure");
  }),false);
  assert.equal(readValue(),"subsequent save");
  assert.deepEqual(clean(),[]);

  // Failure before rename: existing customer file remains byte-for-byte safe.
  const faults=[
    ["writeFileSync",{writeFileSync:()=>{throw Error("disk full")}}],
    ["temp-fsync",{fsyncSync:()=>{throw Error("fsync failed")}}],
    ["renameSync",{renameSync:()=>{throw Error("access denied")}}],
  ];
  for(const [name,override] of faults){
    let opened=0,fsynced=0;
    const io={...fs,...override,
      openSync(...args){opened++;return fs.openSync(...args)},
      fsyncSync(fd){fsynced++;if(override.fsyncSync)return override.fsyncSync(fd);
        return fs.fsyncSync(fd);},
    };
    const before=read();
    assert.equal(writeValidatedSqliteBinaryAtomically(target,newer,validate,io),
      false,name+" failure must reject write");
    assert.deepEqual(read(),before,name+" cannot replace existing SQLite");
    assert.deepEqual(clean(),[],name+" must clean partial temp");
    assert.ok(opened>=1,name+" attempted a uniquely staged file");
    if(name==="renameSync")assert.ok(fsynced>=1,
      "Staged SQLite file must be fsynced BEFORE rename");
  }

  // Once rename succeeds, an OS-specific unsupported directory fsync must
  // NOT report a false failure; a false return would trigger unsafe caller
  // retry even though the new database is already visible.
  let syncCount=0;
  const io={...fs,fsyncSync(fd){
    syncCount++;
    if(syncCount===2)throw Object.assign(Error("not supported"),{code:"EINVAL"});
    return fs.fsyncSync(fd);
  }};
  assert.equal(writeValidatedSqliteBinaryAtomically(target,newer,validate,io),true);
  assert.equal(readValue(),"new transaction");
  assert.equal(syncCount,2,"File and directory sync both attempted");
  assert.deepEqual(clean(),[]);

  // Must fail closed when filename is missing or payload empty.
  assert.equal(writeValidatedSqliteBinaryAtomically(target,new Uint8Array(),validate),false);
  assert.equal(writeValidatedSqliteBinaryAtomically("",newer,validate),false);
  assert.equal(readValue(),"new transaction");
  console.log("Windows native SQLite atomic fsync + rename: real reopen, faults, invalid payload, staging cleanup PASS");
}finally{
  fs.rmSync(folder,{recursive:true,force:true});
}
