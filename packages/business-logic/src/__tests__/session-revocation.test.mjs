import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire, Module} from 'node:module';
const require=createRequire(import.meta.url), ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const permissions=require('../permissions.ts');
let writer='active',scope='active';
const originalLoad=Module._load;
let session;
try{
 Module._load=function(name,parent,isMain){
  if(parent?.filename?.endsWith('session.ts')&&name==='./remote-write')return {registerRemoteWriter(value){writer=value;}};
  if(parent?.filename?.endsWith('session.ts')&&name==='./outbox-bridge')return {setOutboxScope(value){scope=value;}};
  return originalLoad.call(this,name,parent,isMain);
 };
 session=require('../session.ts');
}finally{Module._load=originalLoad;}
test('logout revokes role and writer when sessionStorage is unavailable',()=>{
 delete globalThis.sessionStorage;
 permissions.setCurrentRole('admin');writer='active';scope='active';
 session.clearSession();
 assert.equal(permissions.getCurrentRole(),null);
 assert.equal(permissions.can('sales.create'),false);
 assert.equal(writer,null);assert.equal(scope,null);
});
test('storage removal failure cannot preserve an authenticated role',()=>{
 globalThis.sessionStorage={removeItem(){throw Error('storage blocked');}};
 permissions.setCurrentRole('admin');writer='active';scope='active';
 try{
  assert.throws(()=>session.clearSession(),/storage blocked/);
  assert.equal(permissions.getCurrentRole(),null);
  assert.equal(writer,null);assert.equal(scope,null);
 }finally{delete globalThis.sessionStorage;}
});
