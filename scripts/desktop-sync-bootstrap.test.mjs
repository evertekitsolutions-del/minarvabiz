import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire, Module} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const id='10000000-0000-4000-8000-000000000001';
const source=fs.readFileSync('apps/desktop/src/lib/sqlite-bootstrap.ts','utf8');
function load(api) {
 const state={device:null,imports:[],saves:0};
 const snapshot={outbox:[{deviceId:'legacy-device-hash',sequence:12}]};
 const db={exec(){},query(sql){return sql==='PRAGMA quick_check'?[{quick_check:'ok'}]:[{value:JSON.stringify(snapshot)}];},transaction(fn){return fn();},path:'test.db'};
 const logic={setRuntimeMode(){},setOutboxDeviceId(value){state.device=value;},isSyncDeviceId(value){return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);},importDomainSnapshot(value){state.imports.push(value);return {ok:true};},exportDomainSnapshotFull(){state.saves++;return snapshot;},shouldRunAutoBackup(){return false;}};
 const module=new Module(path.resolve('apps/desktop/src/lib/sqlite-bootstrap.ts'));
 module.require=(name)=>{
  if(name==='@minarvabiz/business-logic')return logic;
  if(name.includes('sqlite-browser'))return {openSqliteDatabase:async()=>{assert.equal(state.device,id);return db;}};
  return require(name);
 };
 globalThis.window={minarvaDesktop:{readSqliteBinary:async()=>null,writeSqliteBinary:async()=>true,...api}};
 module._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,module.id);
 return {runtime:module.exports,state};
}
test('bootstrap rejects missing, invalid, and failed native identity before domain writes',async()=>{
 const previous=console.error; console.error=()=>{};
 try{
  for(const api of [{},{getSyncDeviceId:async()=> 'desktop-win'},{getSyncDeviceId:async()=>{throw Error('persistence_failed');}}]){
   const {runtime,state}=load(api); const result=await runtime.bootstrapDesktopSqlite();
   assert.equal(result.ok,false);assert.equal(runtime.isDesktopSqliteReady(),false);
   assert.equal(state.saves,0);assert.deepEqual(state.imports,[]);
  }
 }finally{console.error=previous;delete globalThis.window;}
});
test('bootstrap uses sync UUID, never calls licensing identity, and preserves historical events',async()=>{
 try{
  const {runtime,state}=load({getSyncDeviceId:async()=>id,getDeviceId:async()=>{throw Error('licensing ID must not be read');}});
  const [a,b]=await Promise.all([runtime.bootstrapDesktopSqlite(),runtime.bootstrapDesktopSqlite()]);
  assert.equal(a.ok,true);assert.equal(b.ok,true);assert.equal(state.device,id);
  assert.equal(state.imports.length,1);assert.equal(state.saves,1);
  assert.equal(state.imports[0].outbox[0].deviceId,'legacy-device-hash');
 }finally{delete globalThis.window;}
});
