import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs, existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function implementation(){
 assert.ok(existsSync(new URL('../apps/desktop/electron/sync-device.ts',import.meta.url)), 'native sync identity implementation must exist');
 return require('../apps/desktop/electron/sync-device.ts');
}
async function directory(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'minarva-sync-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
test('native concurrency, independent readers, and restart retain one identity',async t=>{
 const {createDesktopSyncDeviceReader}=implementation(); const dir=await directory(t);
 const a=createDesktopSyncDeviceReader(dir), b=createDesktopSyncDeviceReader(dir);
 const values=await Promise.all(Array.from({length:24},(_,i)=>i%2?a():b()));
 assert.equal(new Set(values).size,1);
 assert.equal(await fs.readFile(path.join(dir,'sync-device-id'),'utf8'),values[0]);
 assert.equal(await createDesktopSyncDeviceReader(dir)(),values[0]);
 assert.deepEqual(await fs.readdir(dir),['sync-device-id']);
});
test('corruption is preserved and a repaired file can retry in same process',async t=>{
 const {createDesktopSyncDeviceReader}=implementation(); const dir=await directory(t);
 const read=createDesktopSyncDeviceReader(dir); const file=path.join(dir,'sync-device-id');
 for(const raw of ['', 'licensing-hash']){
  await fs.writeFile(file,raw);
  await assert.rejects(read(),/persistence_corrupt/);
  assert.equal(await fs.readFile(file,'utf8'),raw);
 }
 const id='10000000-0000-4000-8000-000000000001'; await fs.writeFile(file,id);
 assert.equal(await read(),id);
});
test('unavailable storage fails closed and retries after recovery',async t=>{
 const {createDesktopSyncDeviceReader}=implementation(); const root=await directory(t);
 const dir=path.join(root,'unavailable'); const read=createDesktopSyncDeviceReader(dir);
 await assert.rejects(read(),/persistence_failed/);
 await fs.mkdir(dir); assert.match(await read(),/^[a-f0-9-]{36}$/);
});
test('independent processes cannot replace the winning identity',async t=>{
 const dir=await directory(t);
 const {execFile}=await import('node:child_process');
 const {promisify}=await import('node:util');
 const run=promisify(execFile);
 const module=path.resolve('apps/desktop/electron/sync-device.ts');
 const code='require(process.argv[1]).createDesktopSyncDeviceReader(process.argv[2])().then(id=>process.stdout.write(id))';
 const children=await Promise.all(Array.from({length:8},()=>run(process.execPath,['-e',code,module,dir])));
 assert.equal(new Set(children.map(r=>r.stdout)).size,1);
 assert.equal(await fs.readFile(path.join(dir,'sync-device-id'),'utf8'),children[0].stdout);
});
