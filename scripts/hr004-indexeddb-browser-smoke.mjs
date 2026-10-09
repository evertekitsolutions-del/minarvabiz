/**
 * HR-004B real Chrome IndexedDB + WebCrypto crash/reload acceptance smoke.
 * Runs in an isolated GitHub CI demo browser, never against customer accounts.
 * Evaluates the ACTUAL vault source transpiled from TypeScript, not an imitation.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const cdpBase=process.env.MINARVA_WEB_CDP || "http://127.0.0.1:9223";
const appBase=process.env.MINARVA_WEB_BASE || "http://127.0.0.1:3000";
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let nextId=0;
const pending=new Map();
async function connect(){
  let target;
  for(let i=0;i<60;i++){
    try{
      const r=await fetch(`${cdpBase}/json/list`);
      const pages=await r.json();
      target=pages.find(p=>p.type==="page"&&p.webSocketDebuggerUrl&&String(p.url).startsWith(appBase));
      if(target)break;
    }catch{}
    await sleep(500);
  }
  if(!target)throw new Error("Browser vault smoke: Chrome CDP target unavailable");
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    ws.addEventListener("open",resolve,{once:true});
    ws.addEventListener("error",reject,{once:true});
  });
  ws.addEventListener("message",e=>{
    let m;try{m=JSON.parse(e.data);}catch{return;}
    const p=pending.get(m.id);
    if(!p)return;
    pending.delete(m.id);clearTimeout(p.timer);
    if(m.error)p.reject(new Error(m.error.message||"CDP failed"));
    else if(m.result?.exceptionDetails)
      p.reject(new Error(m.result.exceptionDetails.exception?.description||
        m.result.exceptionDetails.text||"Browser evaluation rejected"));
    else p.resolve(m.result?.result?.value);
  });
  return ws;
}
async function evaluate(ws,expression,timeoutMs=20000){
  const id=++nextId;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{
      pending.delete(id);reject(new Error("Browser vault CDP timed out"));
    },timeoutMs);
    pending.set(id,{resolve,reject,timer});
    ws.send(JSON.stringify({id,method:"Runtime.evaluate",
      params:{expression,awaitPromise:true,returnByValue:true}}));
  });
}
const source=fs.readFileSync("apps/web/src/lib/roster-recovery-vault.ts","utf8");
const compiled=ts.transpileModule(source,{
  fileName:"roster-recovery-vault.ts",
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const install=`(()=>{const exports={};${compiled};window.__hr004Vault=exports;return true;})()`;
const scopeA={userId:"11111111-1111-4111-8111-111111111111",
  organizationId:"22222222-2222-4222-8222-222222222222"};
const scopeB={userId:"33333333-3333-4333-8333-333333333333",
  organizationId:"44444444-4444-4444-8444-444444444444"};
const shiftId="55555555-5555-4555-8555-555555555555";
const event={
  id:"66666666-6666-4666-8666-666666666666",
  aggregateType:"staff_shift_rules",aggregateId:shiftId,eventType:"update",
  payload:{id:shiftId,name:"Encrypted overnight recovery sample",
    startTime:"09:00",endTime:"17:00",unpaidBreakMinutes:30,
    branchId:null,active:true,version:2},
  occurredAt:"2026-10-09T18:00:00.000Z",
  deviceId:"77777777-7777-4777-8777-777777777777",sequence:17,
  status:"failed",attempts:1,lastError:null,
};
const ws=await connect();
const script=(body)=>`(async()=>{const vault=window.__hr004Vault;${body}})()`;
try{
  await evaluate(ws,install);
  const before=await evaluate(ws,script(`
    const scope=${JSON.stringify(scopeA)};
    const events=[${JSON.stringify(event)}];
    const driver=vault.createIndexedDbRosterRecoveryDriver();
    await vault.saveSealedRosterRecovery(driver,scope,events);
    const key='hr004:v1:'+scope.userId+':'+scope.organizationId;
    const sealed=await driver.read(key);
    return {ciphertext:sealed.ciphertext.length,iv:sealed.iv.length,
      nonextractable:sealed.key.extractable===false,
      plaintextLeak:JSON.stringify(sealed).includes('Encrypted overnight recovery sample')};
  `));
  assert.ok(before.ciphertext>40);
  assert.equal(before.iv,12);
  assert.equal(before.nonextractable,true);
  assert.equal(before.plaintextLeak,false);

  // A real page reload discards all JS modules but retains Chrome profile's
  // IndexedDB structured-clone CryptoKey and authenticated ciphertext.
  await evaluate(ws,"location.reload(); true");
  let reloaded=false;
  for(let i=0;i<40;i++){
    try{
      if(await evaluate(ws,"document.readyState === 'complete'",5000)){reloaded=true;break;}
    }catch{}
    await sleep(350);
  }
  assert.ok(reloaded,"Real Chrome page must load again after restart simulation");
  await evaluate(ws,install);
  const restored=await evaluate(ws,script(`
    const driver=vault.createIndexedDbRosterRecoveryDriver();
    const found=await vault.loadSealedRosterRecovery(driver,${JSON.stringify(scopeA)});
    const another=await vault.loadSealedRosterRecovery(driver,${JSON.stringify(scopeB)});
    return {id:found?.[0]?.id,deviceId:found?.[0]?.deviceId,
      sequence:found?.[0]?.sequence,name:found?.[0]?.payload?.name,
      otherAccount:another};
  `));
  assert.deepEqual({id:restored.id,deviceId:restored.deviceId,sequence:restored.sequence},
    {id:event.id,deviceId:event.deviceId,sequence:event.sequence});
  assert.equal(restored.name,event.payload.name);
  assert.equal(restored.otherAccount,null,"Different tenant cannot read this scope");

  // Real browser offline storage read: no network or WebSocket RPC is used.
  const offline=await evaluate(ws,script(`
    const scope=${JSON.stringify(scopeA)};
    const driver=vault.createIndexedDbRosterRecoveryDriver();
    const current=await vault.loadSealedRosterRecovery(driver,scope);
    return current?.[0]?.id;
  `));
  assert.equal(offline,event.id);

  const tamper=await evaluate(ws,script(`
    const driver=vault.createIndexedDbRosterRecoveryDriver();
    const scope=${JSON.stringify(scopeA)};
    const key='hr004:v1:'+scope.userId+':'+scope.organizationId;
    const original=await driver.read(key);
    const modified={...original,ciphertext:[...original.ciphertext]};
    modified.ciphertext[5]^=1;
    await driver.write(modified);
    let refused=false;
    try{await vault.loadSealedRosterRecovery(driver,scope);}
    catch(e){refused=String(e.message).includes('authentication failed');}
    await driver.write(original);
    const intact=await vault.loadSealedRosterRecovery(driver,scope);
    return {refused,intact:intact?.[0]?.id};
  `));
  assert.equal(tamper.refused,true,"Authenticity failure must reject modified ciphertext");
  assert.equal(tamper.intact,event.id);

  const scopedErase=await evaluate(ws,script(`
    const driver=vault.createIndexedDbRosterRecoveryDriver();
    const a=${JSON.stringify(scopeA)},b=${JSON.stringify(scopeB)};
    await vault.saveSealedRosterRecovery(driver,b,[${JSON.stringify({...event,id:"88888888-8888-4888-8888-888888888888"})}]);
    await vault.eraseSealedRosterRecovery(driver,a);
    const first=await vault.loadSealedRosterRecovery(driver,a);
    const second=await vault.loadSealedRosterRecovery(driver,b);
    return {first,second:second?.[0]?.id};
  `));
  assert.equal(scopedErase.first,null);
  assert.equal(scopedErase.second,"88888888-8888-4888-8888-888888888888");
  console.log("HR-004B real Chrome IndexedDB: native key persistence, reload, scope separation, tamper refusal and scoped erase PASS");
}finally{
  ws.close();
}
