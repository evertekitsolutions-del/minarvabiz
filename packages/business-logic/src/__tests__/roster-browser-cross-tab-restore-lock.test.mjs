import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(module,file)=>module._compile(ts.transpileModule(
  fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,
    target:ts.ScriptTarget.ES2022,esModuleInterop:true}}
).outputText,file);
const {withExclusiveRosterRecoveryTabLock}=require(
  "../../../../apps/web/src/lib/roster-recovery-tab-lock.ts");

const original=Object.getOwnPropertyDescriptor(globalThis,"navigator");
const setNavigator=value=>Object.defineProperty(globalThis,"navigator",
  {configurable:true,writable:true,value});
try {
  setNavigator({});
  let effects=0;
  await assert.rejects(()=>withExclusiveRosterRecoveryTabLock(async()=>{
    effects++;return "unsafe";
  }),/Web Locks.*required/);
  assert.equal(effects,0,"Unavailable lock must fail before any restore work");

  let occupied=false,grants=0;
  const lockManager={
    request:async(name,options,callback)=>{
      assert.equal(name,"minarvabiz:hr004b:reviewed-local-restore");
      assert.deepEqual(options,{mode:"exclusive",ifAvailable:true});
      if(occupied)return callback(null);
      occupied=true;grants++;
      try{return await callback({name,mode:"exclusive"});}
      finally{occupied=false;}
    },
  };
  setNavigator({locks:lockManager});
  let release;
  const hold=new Promise(resolve=>{release=resolve;});
  const first=withExclusiveRosterRecoveryTabLock(async()=>{
    effects++;await hold;return "first complete";
  });
  await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(()=>withExclusiveRosterRecoveryTabLock(async()=>{
    effects++;return "unsafe overlapping restore";
  }),/Another browser tab/);
  assert.equal(effects,1,"Competing tab never enters fresh read/hydration window");
  release();
  assert.equal(await first,"first complete");
  assert.equal(await withExclusiveRosterRecoveryTabLock(async()=>{
    effects++;return "second after fresh review";
  }),"second after fresh review");
  assert.equal(grants,2);
  assert.equal(effects,2);
  await assert.rejects(()=>withExclusiveRosterRecoveryTabLock(async()=>{
    throw new Error("Cloud read rejected");
  }),/Cloud read rejected/);
  assert.equal(await withExclusiveRosterRecoveryTabLock(async()=>"released"),"released",
    "Exception must release Web Lock, not leave user permanently blocked");

  // The lock is a precondition for the existing local-only authorities, not
  // a new restore button or authorization for multi-ID or Cloud replay.
  const restore=fs.readFileSync("apps/web/src/lib/roster-recovery-restore.ts","utf8");
  assert.match(restore,/withExclusiveRosterRecoveryTabLock\(\(\) => restoreReviewedSealedRosterEventUnlocked\(approved\)\)/);
  assert.match(restore,/withExclusiveRosterRecoveryTabLock\(\(\) => restoreReviewedSealedRosterChainUnlocked\(approved\)\)/);
  const multiId=fs.readFileSync("apps/web/src/lib/roster-recovery-multiid-plan.ts","utf8");
  assert.match(multiId,/automaticRecoveryAllowed:false/);
  const page=fs.readFileSync("apps/web/src/app/(app)/roster/page.tsx","utf8");
  assert.doesNotMatch(page,/restoreReviewedSealedRosterMultiIdToMemory/);
  console.log("HR004B browser-tab reviewed restore exclusive lock, contention, unsupported API, release and no multi-ID replay PASS");
} finally {
  if(original)Object.defineProperty(globalThis,"navigator",original);
  else delete globalThis.navigator;
}
