import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
import Module from "node:module";

const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,f);
const source="../../../../apps/web/src/lib/roster-recovery-dependencies.ts";
const {analyzeSealedRosterDependencies}=require(source);

const shiftId="33333333-3333-4333-8333-333333333333";
const staffId="44444444-4444-4444-8444-444444444444";
const device="55555555-5555-4555-8555-555555555555";
function comparison(n,opts={}){
  const type=opts.aggregateType??"staff_roster_slots";
  const aggregateId=opts.aggregateId??`slot-${n}`;
  const payload=type==="staff_shift_rules"
    ?{id:aggregateId,version:2,name:"Shift "+n}
    :{id:aggregateId,version:2,staffId,shiftRuleId:shiftId,workDate:"2026-11-11",status:"scheduled"};
  return {eventId:`event-${n}`,aggregateType:type,aggregateId,
    eventType:opts.eventType??"update",deviceId:opts.deviceId??device,sequence:opts.sequence??n,
    localStatus:"failed",localVersion:2,remotePresence:"visible",remoteVersion:1,
    localPayload:payload,remotePayload:{...payload,version:1},
    ...opts};
}
const shift=comparison(1,{aggregateType:"staff_shift_rules",aggregateId:shiftId});
const slot=comparison(2);
const slotDifferentId=comparison(3);
const result=analyzeSealedRosterDependencies({comparisons:[shift,slot,slotDifferentId],total:3});
assert.equal(result.completeBatch,true);
assert.equal(result.automaticRecoveryAllowed,false);
assert.deepEqual(result.findings.filter(f=>f.kind==="shift-before-slot").map(f=>f.eventIds),
  [[shift.eventId,slot.eventId],[shift.eventId,slotDifferentId.eventId]]);
assert.equal(result.findings.filter(f=>f.kind==="same-day-different-id").length,1);
assert.ok(result.findings.every(f=>!f.message.includes("safe to replay")));
assert.equal(analyzeSealedRosterDependencies({comparisons:[],total:0}).automaticRecoveryAllowed,false);
const cloudPeer={id:"99999999-9999-4999-8999-999999999999",
  staffId,workDate:"2026-11-11",shiftRuleId:shiftId,
  branchId:null,status:"scheduled",version:1};
const cloudDifferent=analyzeSealedRosterDependencies({
  comparisons:[{...slot,sameDayCloudPeers:[cloudPeer]}],total:1
});
assert.equal(cloudDifferent.findings.some(f=>f.kind==="cloud-day-different-id"),true);
assert.equal(cloudDifferent.automaticRecoveryAllowed,false);
const unverified=analyzeSealedRosterDependencies({comparisons:[slot],total:1});
assert.equal(unverified.findings.some(f=>f.kind==="cloud-day-unverified"),true);
const inconsistent=analyzeSealedRosterDependencies({
  comparisons:[{...slot,sameDayCloudPeers:[]}],total:1
});
assert.equal(inconsistent.findings.some(f=>f.kind==="cloud-day-unverified"),true);
const consistent=analyzeSealedRosterDependencies({
  comparisons:[{...slot,sameDayCloudPeers:[{
    id:slot.aggregateId,staffId,workDate:"2026-11-11",
    shiftRuleId:shiftId,branchId:null,status:"scheduled",version:1
  }]}],total:1
});
assert.equal(consistent.findings.some(f=>f.kind==="cloud-day-different-id"),false);
assert.equal(consistent.findings.some(f=>f.kind==="cloud-day-unverified"),false);
for(const wrong of [
  {...cloudPeer,staffId:"foreign-staff"},
  {...cloudPeer,workDate:"2026-11-12"},
  {...cloudPeer,version:0}
]) assert.throws(()=>analyzeSealedRosterDependencies({
  comparisons:[{...slot,sameDayCloudPeers:[wrong]}],total:1
}),/Untrusted or cross-scope/);
assert.throws(()=>analyzeSealedRosterDependencies({
  comparisons:[{...slot,sameDayCloudPeers:[cloudPeer,cloudPeer]}],total:1
}),/Untrusted or cross-scope/);

const before=structuredClone([shift,slot,slotDifferentId]);
assert.deepEqual([shift,slot,slotDifferentId],before,"Read-only analysis never alters the reviewed events");

const sameRecord=comparison(4,{aggregateId:slot.aggregateId,sequence:4});
const same=analyzeSealedRosterDependencies({comparisons:[slot,sameRecord],total:2});
assert.equal(same.findings.filter(f=>f.kind==="same-record").length,1);
assert.match(same.findings.find(f=>f.kind==="same-record").message,/lower device sequence/);
const remoteDevice=comparison(4,{aggregateId:slot.aggregateId,deviceId:"66666666-6666-4666-8666-666666666666"});
const mixed=analyzeSealedRosterDependencies({comparisons:[slot,remoteDevice],total:2});
assert.match(mixed.findings.find(f=>f.kind==="same-record").message,/Different devices/);
const collision=comparison(5,{sequence:slot.sequence});
assert.equal(analyzeSealedRosterDependencies({comparisons:[slot,collision],total:2})
  .findings.some(f=>f.kind==="sequence-collision"),true);
const incomplete=analyzeSealedRosterDependencies({comparisons:[slot],total:26});
assert.equal(incomplete.completeBatch,false);
assert.equal(incomplete.findings[0].kind,"incomplete-batch");
assert.match(incomplete.findings[0].message,/leave all events quarantined/);

const hidden=comparison(7,{remotePresence:"missing-or-hidden",remoteVersion:null,remotePayload:null});
assert.equal(analyzeSealedRosterDependencies({comparisons:[hidden],total:1})
  .findings.some(f=>f.kind==="cloud-uncertain"),true);
const advanced=comparison(7,{remoteVersion:2});
assert.equal(analyzeSealedRosterDependencies({comparisons:[advanced],total:1})
  .findings.some(f=>f.kind==="cloud-uncertain"),true);
const insert=comparison(7,{eventType:"insert",remoteVersion:1});
assert.equal(analyzeSealedRosterDependencies({comparisons:[insert],total:1})
  .findings.some(f=>f.kind==="cloud-uncertain"),true);
for(const broken of [
  {...slot,localPayload:{...slot.localPayload,id:"wrong-id"}},
  {...slot,sequence:0},
  {...slot,eventType:"execute"},
  {...slot,remotePresence:"missing-or-hidden",remoteVersion:1},
  {...slot,deviceId:""},
  {...slot,aggregateType:"staff_roster_slots",localPayload:{id:slot.aggregateId,version:2}},
]) assert.throws(()=>analyzeSealedRosterDependencies({comparisons:[broken],total:1}),/Malformed|lack/);
assert.throws(()=>analyzeSealedRosterDependencies({comparisons:[slot,slot],total:2}),/Duplicate/);
assert.throws(()=>analyzeSealedRosterDependencies({comparisons:[slot],total:0}),/Invalid bounded/);
assert.throws(()=>analyzeSealedRosterDependencies({comparisons:Array(26).fill(slot),total:26}),/Invalid bounded/);

const page=fs.readFileSync("apps/web/src/app/(app)/roster/page.tsx","utf8");
const checkpoint=fs.readFileSync("apps/web/src/lib/roster-recovery-checkpoint.ts","utf8");
assert.match(checkpoint,/eventType:event\.eventType,deviceId:event\.deviceId,sequence:event\.sequence/);
assert.match(page,/analyzeSealedRosterDependencies\(report\)/);
assert.match(page,/Multiple-event restores remain disabled/);
assert.match(page,/A single roster assignment must have exactly one matching RLS-scoped Cloud staff\\/date peer/);
assert.match(page,/staff\/date snapshot containing only the identical canonical ID/);
assert.match(page,/isReviewedSealedRosterRestoreCandidate\(sealedReview\)/);
assert.doesNotMatch(fs.readFileSync("apps/web/src/lib/roster-recovery-dependencies.ts","utf8"),
  /pgRpc|fetch\(|upsertRosterEvent|hydrateOutbox|saveSealedRosterRecovery|\.delete\(|window\./,
  "Dependency analysis must not include network/write/restore functions");
console.log("HR004B ordered multi-event/different-ID read-only dependency analysis PASS");
