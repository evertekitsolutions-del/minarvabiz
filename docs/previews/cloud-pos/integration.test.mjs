// Install test-only dependencies outside the repo and set POS_TEST_MODULES to that node_modules path.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {openStore,transact,synchronize} from './storage.mjs';
const root=process.env.POS_TEST_MODULES;
if(!root) throw new Error('Set POS_TEST_MODULES to test-only node_modules (see README).');
const {indexedDB}=await import(pathToFileURL(`${root}/fake-indexeddb/build/esm/index.js`));
const {PGlite}=await import(pathToFileURL(`${root}/@electric-sql/pglite/dist/index.js`));
const db=await openStore(indexedDB);
test('IndexedDB serializes writers and aborts failed mutations',async()=>{
 await Promise.all(Array.from({length:20},()=>transact(db,'local',s=>{s.revision++;})));
 assert.equal((await transact(db,'local')).revision,20);
 await assert.rejects(transact(db,'local',s=>{s.revision=999;throw Error('disk simulation');}));
 assert.equal((await transact(db,'local')).revision,20);
});
test('lost response retries exact durable operation; conflict retains local state',async()=>{
 await transact(db,'retry',s=>{s.data.tenants.push({id:'a'});s.dirty=true;});
 let first, attempts=0;
 const remote={write:async op=>{attempts++;if(!first){first=structuredClone(op);throw Error('network response lost');}assert.deepEqual(op,first);return 1;}};
 await assert.rejects(synchronize(db,'retry',remote,()=> 'operation'));
 assert.equal((await transact(db,'retry')).operation.id,'operation');
 const result=await synchronize(db,'retry',remote);assert.equal(result.dirty,false);assert.equal(attempts,2);
 await transact(db,'conflict',s=>{s.data.tenants.push({id:'local'});s.dirty=true;});
 await assert.rejects(synchronize(db,'conflict',{write:async()=>{throw Object.assign(Error('conflict'),{code:'40001'});}},()=> 'conflict-op'));
 const conflict=await transact(db,'conflict');assert.equal(conflict.conflict,true);assert.equal(conflict.data.tenants[0].id,'local');assert.equal(conflict.operation.id,'conflict-op');
});
test('clean cloud fetch cannot replace an edit made while fetch is pending',async()=>{
 await synchronize(db,'fetch-race',{read:async()=>{await transact(db,'fetch-race',s=>{s.dirty=true;s.data.tenants.push({id:'new'});});return {revision:99,data:{tenants:[]}};}});
 assert.equal((await transact(db,'fetch-race')).data.tenants[0].id,'new');
});
test('actual PostgreSQL RLS, CAS, operation replay and unauthorized RPC',async()=>{
 const pg=new PGlite();
 await pg.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
 await pg.exec(await readFile(new URL('./setup.sql',import.meta.url),'utf8'));
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',op='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 await pg.query('insert into auth.users values ($1),($2)',[a,b]);
 await pg.exec('set role authenticated');await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
 const call=(rev,id,data)=>pg.query('select public.html_pos_commit($1,$2,$3) as revision',[rev,id,data]);
 assert.equal((await call(0,op,{tenants:[]})).rows[0].revision,1);
 assert.equal((await call(0,op,{tenants:[]})).rows[0].revision,1);
 await assert.rejects(call(0,op,{tenants:['changed']}),e=>e.code==='22023');
 await assert.rejects(call(0,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',{}),e=>e.code==='40001');
 assert.equal((await pg.query('select * from public.html_pos_receipts')).rows.length,1);
 await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);
 assert.equal((await pg.query('select * from public.html_pos_workspaces')).rows.length,0);
 assert.equal((await pg.query('select * from public.html_pos_receipts')).rows.length,0);
 await assert.rejects(pg.query('insert into public.html_pos_workspaces values($1,1,$2,now())',[a,{}]),e=>e.code==='42501');
 await pg.exec('reset role;set role anon');
 await assert.rejects(call(0,op,{}),e=>e.code==='42501');
 await pg.close();
});
