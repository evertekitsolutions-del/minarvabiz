import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(module,file)=>module._compile(ts.transpileModule(
  fs.readFileSync(file,"utf8"),{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
    esModuleInterop:true
  }}).outputText,file);
const {planMultiIdRosterReview}=require("../../../../apps/web/src/lib/roster-recovery-multiid-plan.ts");

const scope={userId:"10000000-0000-4000-8000-000000000001",
  organizationId:"20000000-0000-4000-8000-000000000001"};
const deviceId="30000000-0000-4000-8000-000000000001";
const shiftId="40000000-0000-4000-8000-000000000001";
const slotId="50000000-0000-4000-8000-000000000001";
const staffId="60000000-0000-4000-8000-000000000001";
const remoteShift={id:shiftId,name:"Early",startTime:"09:00",endTime:"17:00",
  unpaidBreakMinutes:30,branchId:null,active:true,version:2};
const localShift={...remoteShift,name:"Morning",version:3};
const remoteSlot={id:slotId,staffId,shiftRuleId:shiftId,branchId:null,
  workDate:"2026-11-11",status:"scheduled",version:3};
const localSlot={...remoteSlot,status:"cancelled",version:4};
const shift={
  eventId:"70000000-0000-4000-8000-000000000001",
  aggregateType:"staff_shift_rules",aggregateId:shiftId,
  eventType:"update",deviceId,sequence:42,localStatus:"failed",
  localVersion:3,remoteVersion:2,remotePresence:"visible",
  localPayload:localShift,remotePayload:remoteShift,sameDayCloudPeers:null
};
const slot={
  eventId:"70000000-0000-4000-8000-000000000002",
  aggregateType:"staff_roster_slots",aggregateId:slotId,
  eventType:"update",deviceId,sequence:43,localStatus:"pending",
  localVersion:4,remoteVersion:3,remotePresence:"visible",
  localPayload:localSlot,remotePayload:remoteSlot,sameDayCloudPeers:[remoteSlot]
};
const original={scope,total:2,comparisons:[slot,shift]};
const before=structuredClone(original);
const result=planMultiIdRosterReview(original);
assert.equal(result.reviewOrderAvailable,true,JSON.stringify(result));
assert.equal(result.automaticRecoveryAllowed,false);
assert.deepEqual(result.steps.map(x=>x.eventId),[shift.eventId,slot.eventId]);
assert.deepEqual(result.steps.map(x=>x.deviceSequence),[42,43]);
assert.deepEqual(result.steps[1].prerequisites,[shift.eventId]);
assert.deepEqual(original,before,"Planning must not modify any recovery bytes or order");

const denied=(change,reason)=>{
  const input={...original,...change};
  const out=planMultiIdRosterReview(input);
  assert.equal(out.reviewOrderAvailable,false,reason+JSON.stringify(out));
  assert.equal(out.automaticRecoveryAllowed,false);
  assert.deepEqual(out.steps,[],"Denied plan must not expose a partial executable order");
};
denied({total:3},"Partial backup cannot be ordered");
denied({comparisons:[shift]},"Single event is handled by existing independent review");
denied({comparisons:[slot,slot]},"Identical event is duplicate");
denied({comparisons:[slot,{...shift,eventId:slot.eventId}]},"Duplicate event ID");
denied({comparisons:[slot,{...shift,deviceId:"other-device"}]},"Cross device order unverified");
denied({comparisons:[slot,{...shift,sequence:41}]},"Gapped device sequence");
denied({comparisons:[slot,{...shift,sequence:43}]},"Duplicated device sequence");
denied({comparisons:[slot,{...shift,eventType:"insert"}]},"Unreviewed insert");
denied({comparisons:[slot,{...shift,localStatus:"synced"}]},"Acknowledged event");
denied({comparisons:[slot,{...shift,remotePresence:"missing-or-hidden",
    remoteVersion:null,remotePayload:null}]},"Hidden Cloud state");
denied({comparisons:[slot,{...shift,remoteVersion:3}]},"Stale revision");
denied({comparisons:[slot,{...shift,localVersion:4}]},"Non-consecutive revision");
denied({comparisons:[slot,{...shift,localPayload:{...localShift,branchId:"foreign"}}]},"Shift branch move");
denied({comparisons:[slot,{...shift,localPayload:{...localShift,startTime:"08:00"}}]},"Historical dependent time");
denied({comparisons:[slot,{...shift,sequence:44}]},"Dependency appears after slot");
denied({comparisons:[shift,{...slot,sameDayCloudPeers:null}]},"Absent peer");
denied({comparisons:[shift,{...slot,sameDayCloudPeers:[]}]},"No verified peers");
denied({comparisons:[shift,{...slot,sameDayCloudPeers:[remoteSlot,{...remoteSlot,id:"different"}]}]},"Other Cloud ID");
denied({comparisons:[shift,{...slot,sameDayCloudPeers:[{...remoteSlot,shiftRuleId:"other"}]}]},"Other shift in visible Cloud snapshot");
denied({comparisons:[shift,{...slot,sameDayCloudPeers:[{...remoteSlot,status:"cancelled"}]}]},"Historical Cloud status changed");
denied({comparisons:[shift,{...slot,localPayload:{...localSlot,staffId:"foreign"}}]},"Staff mismatch");
denied({comparisons:[shift,{...slot,localPayload:{...localSlot,workDate:"2026-02-30"}}]},"Invalid roster date/scope");
denied({scope:{userId:"",organizationId:scope.organizationId}},"Missing identity scope");
denied({comparisons:[shift,{...slot,aggregateType:"staff_shift_rules",aggregateId:shiftId,
  localPayload:localShift,remotePayload:remoteShift}]},"Repeated record chain");
const anotherSlot={...slot,eventId:"70000000-0000-4000-8000-000000000003",
  aggregateId:"50000000-0000-4000-8000-000000000003",
  sequence:44,localPayload:{...localSlot,id:"50000000-0000-4000-8000-000000000003"},
  remotePayload:{...remoteSlot,id:"50000000-0000-4000-8000-000000000003"},
  sameDayCloudPeers:[{...remoteSlot,id:"50000000-0000-4000-8000-000000000003"}]};
denied({total:3,comparisons:[shift,slot,anotherSlot]},"Same staff/day different-ID ambiguity");

// Independent canonical IDs on different staff/dates can appear in one
// read-only order: never provide any automatic replay/merge permission.
const anotherStaff={...anotherSlot,localPayload:{...anotherSlot.localPayload,
  staffId:"60000000-0000-4000-8000-000000000002"},
  remotePayload:{...anotherSlot.remotePayload,staffId:"60000000-0000-4000-8000-000000000002"},
  sameDayCloudPeers:[{...anotherSlot.sameDayCloudPeers[0],
    staffId:"60000000-0000-4000-8000-000000000002"}]};
const independent=planMultiIdRosterReview({scope,total:3,
  comparisons:[anotherStaff,slot,shift]});
assert.equal(independent.reviewOrderAvailable,true,JSON.stringify(independent));
assert.equal(independent.steps.length,3);
assert.equal(independent.automaticRecoveryAllowed,false);

const source=fs.readFileSync("apps/web/src/lib/roster-recovery-multiid-plan.ts","utf8");
assert.doesNotMatch(source,/(?:fetch\(|pgRpc|hydrateOutbox|hydratePhase6|flushWorkforceRoster|window\.|localStorage|indexedDB)/,
  "Planner must remain pure read-only code");
const page=fs.readFileSync("apps/web/src/app/(app)/roster/page.tsx","utf8");
assert.match(page,/planMultiIdRosterReview\(sealedReview\)/);
assert.match(page,/human review only/i);
assert.match(page,/automatic.*recovery.*disabled/i);
console.log("HR004B deterministic multiple-ID review-only ordering, quarantines, Cloud peer and no replay PASS");
