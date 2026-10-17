import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const file = new URL('../sync-device.ts', import.meta.url);
const A = '10000000-0000-4000-8000-000000000001';
const B = '10000000-0000-4000-8000-000000000002';
function implementation() {
  assert.ok(fs.existsSync(file), 'sync-device implementation must exist');
  return require('../sync-device.ts');
}
test('concurrent callers receive the one persisted identity', async () => {
  const { getOrCreateSyncDeviceId } = implementation();
  let value = null, writes = 0, generated = 0;
  const persistence = { read: async () => value, write: async id => { writes++; value = id; } };
  const results = await Promise.all(Array.from({length:20}, () => getOrCreateSyncDeviceId(persistence, () => ++generated === 1 ? A : B)));
  assert.equal(writes, 1); assert.equal(generated, 1);
  for (const result of results) assert.deepEqual(result, {ok:true,value:A});
  assert.equal(value, A);
});
test('failed persistence can retry and generation errors are results', async () => {
  const { getOrCreateSyncDeviceId } = implementation();
  let fail = true, value = null;
  const persistence = {read:async()=>value,write:async id=>{if(fail)throw Error('disk full');value=id;}};
  assert.equal((await getOrCreateSyncDeviceId(persistence,()=>A)).code,'persistence_failed');
  fail=false;
  assert.deepEqual(await getOrCreateSyncDeviceId(persistence,()=>A),{ok:true,value:A});
  const result=await getOrCreateSyncDeviceId({read:async()=>null,write:async()=>{}},()=>{throw Error('no crypto');});
  assert.equal(result.code,'persistence_failed');
});
test('corruption cannot rotate an established identity', async () => {
  const { getOrCreateSyncDeviceId, isSyncDeviceId } = implementation();
  for (const invalid of ['', 'desktop-win', '00000000-0000-0000-0000-000000000000', '10000000-0000-4000-0000-000000000001']) {
    assert.equal(isSyncDeviceId(invalid),false);
    let writes=0;
    const result=await getOrCreateSyncDeviceId({read:async()=>invalid,write:async()=>{writes++;}},()=>A);
    assert.equal(result.code,'persistence_corrupt'); assert.equal(writes,0);
  }
});
test('different persistence scopes do not share an identity', async()=>{
 const {getOrCreateSyncDeviceId}=implementation();
 const make=()=>({read:async()=>null,write:async()=>{}});
 const values=await Promise.all([getOrCreateSyncDeviceId(make(),()=>A),getOrCreateSyncDeviceId(make(),()=>B)]);
 assert.deepEqual(values.map(r=>r.value),[A,B]);
});
