import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForDesktopWorkspace } from './desktop-workspace-ready.mjs';

const active = { rendererReady:true, rendererError:false, hasContent:true, hasNavigation:true, text:'Dashboard' };
function clock() {
  let time=0;
  return {now:()=>time,sleep:async ms=>{time+=ms;},timeoutMs:1000,intervalMs:100};
}
test('renderer mount and trial activation do not imply workspace readiness',async()=>{
  const states=[{...active,hasContent:false,hasNavigation:false,text:'Initializing Minarva Biz…'},
    {...active,hasNavigation:false,text:'Loading'},active];
  let reads=0;
  await waitForDesktopWorkspace(async()=>states[reads++],clock());
  assert.equal(reads,3);
});
test('workspace requires a fresh ready renderer plus content and actionable navigation',async()=>{
  let reads=0;
  await waitForDesktopWorkspace(async()=>++reads===1?{...active,rendererReady:false}:active,clock());
  assert.equal(reads,2);
});
test('startup errors fail immediately with diagnostic text',async()=>{
  let reads=0;
  await assert.rejects(waitForDesktopWorkspace(async()=>{reads++;return {...active,rendererError:true,text:'Database recovery required'};},clock()),/Database recovery required/);
  assert.equal(reads,1);
});
test('unavailable or locked workspace times out rather than skipping UI tests',async()=>{
  let reads=0;
  await assert.rejects(waitForDesktopWorkspace(async()=>{reads++;return {...active,hasContent:false,text:'Activate your free trial'};},clock()),/workspace.*1000ms.*Activate your free trial/i);
  assert.equal(reads,11);
});
test('CDP failures are propagated rather than reported as a successful retry',async()=>{
  await assert.rejects(waitForDesktopWorkspace(async()=>{throw new Error('CDP connection closed');},clock()),/CDP connection closed/);
});
