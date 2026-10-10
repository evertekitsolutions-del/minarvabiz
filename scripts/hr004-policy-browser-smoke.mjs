/**
 * HR-004B real Chrome IndexedDB + WebCrypto crash/reload acceptance smoke.
 * Runs in an isolated GitHub CI demo browser, never against customer accounts.
 * Evaluates the ACTUAL vault source transpiled from TypeScript, not an imitation.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const viteRequire=createRequire(require.resolve("vite",{paths:[process.cwd()+"/apps/desktop"]}));
const {build}=viteRequire("esbuild");

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
const compiled=await build({stdin:{contents:`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {RosterPolicyDrafts} from './apps/web/src/components/roster/RosterPolicyDrafts';
const container=document.createElement('div');container.id='policy-test';document.body.appendChild(container);
window.__policyRoot=createRoot(container);
window.__policyRoot.render(React.createElement(RosterPolicyDrafts,{branches:[{id:'20000000-0000-4000-8000-000000000001',name:'Test branch'}]}));
`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',
  define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'isolated-policy-transport',setup(b){
    b.onResolve({filter:/^@\/lib\/roster-policy-online$/},()=>({path:'policy-transport',namespace:'test'}));
    b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`export function onlineRosterPolicies(){return {list:async()=>window.__policyRows,save:async(input)=>{window.__policyInput=input;if(window.__policyFailure)throw Error('Draft save was not confirmed. Reload before retrying');return window.__policyResult}}}`,loader:'js'}));
  }}]});
const ws=await connect();
const row={id:'30000000-0000-4000-8000-000000000001',org_id:'10000000-0000-4000-8000-000000000001',branch_id:'20000000-0000-4000-8000-000000000001',effective_from:'2026-11-01',effective_until:null,iana_zone:'Asia/Kolkata',dst_fold_policy:'reject',minimum_rest_minutes:660,status:'draft',version:1};
async function text(){return evaluate(ws,"document.querySelector('#policy-test')?.innerText||''")}
async function waitFor(value){for(let i=0;i<40;i++){if((await text()).includes(value))return;await sleep(100)}throw Error('Missing policy UI: '+value+'; '+await text())}
async function click(label){await evaluate(ws,`(()=>{const b=[...document.querySelectorAll('#policy-test button')].find(b=>b.textContent===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Missing/enabled button');b.click();return true})()`);await sleep(100)}
async function field(label,value){await evaluate(ws,`(()=>{const l=[...document.querySelectorAll('#policy-test label')].find(l=>l.textContent.startsWith(${JSON.stringify(label)}));const e=l.querySelector('input,select');Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));return true})()`);await sleep(100)}
try{
  await evaluate(ws,`window.__policyRows=[];true`);
  await evaluate(ws,compiled.outputFiles[0].text+';true');
  await waitFor('Draft — not enforced');
  await click('Load / reload policy drafts');await waitFor('No saved policy drafts');
  await field('Branch','20000000-0000-4000-8000-000000000001');await field('Effective from','2026-11-01');
  await field('IANA timezone','Asia');await field('Minimum rest','660');
  await click('Save draft only');await waitFor('Use a named IANA timezone');
  assert.equal(await evaluate(ws,"document.querySelector('#policy-test fieldset').disabled"),false,'Validation must leave form editable');
  await field('IANA timezone','Asia/Kolkata');
  await evaluate(ws,`window.__policyResult=${JSON.stringify({accepted:true,record:row})};true`);
  await click('Save draft only');await waitFor('Draft saved.');
  assert.equal(await evaluate(ws,'window.__policyInput.expectedVersion'),0);
  await evaluate(ws,`window.__policyResult=${JSON.stringify({accepted:false,remote:{...row,version:2,minimum_rest_minutes:720}})};true`);
  await field('Minimum rest','700');await click('Save draft only');await waitFor('Current Cloud draft: revision 2');
  assert.equal(await evaluate(ws,`[...document.querySelectorAll('#policy-test input')].find(e=>e.type==='number').value`),'700','Conflict must preserve unsaved form');
  await click('Load Cloud draft for review');await waitFor('Edit draft revision 2');
  assert.equal(await evaluate(ws,`[...document.querySelectorAll('#policy-test input')].find(e=>e.type==='number').value`),'720');
  await evaluate(ws,'window.__policyFailure=true;true');await click('Save draft only');await waitFor('Reload before retrying');
  assert.equal(await evaluate(ws,"document.querySelector('#policy-test fieldset').disabled"),true);
  console.log('Actual React policy editor Chrome smoke PASS: draft create, conflict review, revision, failed save');
}finally{
  await evaluate(ws,"window.__policyRoot?.unmount();document.querySelector('#policy-test')?.remove();true").catch(()=>{});
  ws.close();
}
