/**
 * HR-004B: bounded, DETERMINISTIC, READ-ONLY proposed review order for
 * distinct canonical roster records. This deliberately cannot restore,
 * reconcile, retry, acknowledge, delete or send any event.
 *
 * An RLS-visible Cloud read and a sequential device stream are only evidence
 * for human review, NEVER authoritative proof that concurrent/hidden records
 * do not exist. An audited transactional Cloud guard is required before any
 * multi-ID recovery can be enabled.
 */
import type { SealedRosterCloudComparison } from "./roster-recovery-checkpoint";

export type MultiIdReviewStep = {
  eventId:string;
  aggregateId:string;
  aggregateType:SealedRosterCloudComparison["aggregateType"];
  deviceSequence:number;
  prerequisites:string[];
};
export type MultiIdReadOnlyPlan =
  | { reviewOrderAvailable:false; reason:string; automaticRecoveryAllowed:false; steps:[] }
  | { reviewOrderAvailable:true; reason:string; automaticRecoveryAllowed:false; steps:MultiIdReviewStep[] };

type Review = {
  total:number;
  comparisons:readonly SealedRosterCloudComparison[];
  scope?:{userId:string;organizationId:string};
};
const reject=(reason:string):MultiIdReadOnlyPlan=>({
  reviewOrderAvailable:false,reason,automaticRecoveryAllowed:false,steps:[]
});
const object=(v:unknown):v is Record<string,unknown> =>
  v!==null && typeof v==="object" && !Array.isArray(v);
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

/**
 * A successful result is an ordered display of known evidence only.
 * It is NEVER a permission or a reliable recipe for network/local writes.
 */
export function planMultiIdRosterReview(input:Review):MultiIdReadOnlyPlan {
  if(!input || !Number.isSafeInteger(input.total) || input.total<2 ||
     input.total>25 || !Array.isArray(input.comparisons) ||
     input.comparisons.length!==input.total ||
     !object(input.scope) ||
     typeof input.scope.userId!=="string" || !input.scope.userId ||
     typeof input.scope.organizationId!=="string" || !input.scope.organizationId)
    return reject("Complete 2–25 event user/organization-scoped comparison required");
  const events=[...input.comparisons];
  const ids=new Set<string>(),aggregateKeys=new Set<string>();
  const first=events[0];
  if(!first || typeof first.deviceId!=="string" || !first.deviceId)
    return reject("Original recovery device identity is unavailable");

  for(const event of events){
    if(!event || typeof event.eventId!=="string" || !event.eventId ||
       ids.has(event.eventId) ||
       !["staff_shift_rules","staff_roster_slots"].includes(event.aggregateType) ||
       typeof event.aggregateId!=="string" || !event.aggregateId ||
       !Number.isSafeInteger(event.sequence) || event.sequence<1 ||
       event.deviceId!==first.deviceId || event.eventType!=="update" ||
       (event.localStatus!=="pending" && event.localStatus!=="failed") ||
       event.remotePresence!=="visible" || !object(event.remotePayload) ||
       !object(event.localPayload) ||
       event.remotePayload.id!==event.aggregateId ||
       event.localPayload.id!==event.aggregateId ||
       !Number.isSafeInteger(event.remoteVersion) || event.remoteVersion===null ||
       event.remoteVersion<1 || !Number.isSafeInteger(event.localVersion) ||
       event.localVersion!==event.remoteVersion+1 ||
       event.localPayload.version!==event.localVersion ||
       event.remotePayload.version!==event.remoteVersion)
      return reject("Unconfirmed updates must have distinct original IDs and identical authorized baseline revisions");
    const key=event.aggregateType+":"+event.aggregateId;
    if(aggregateKeys.has(key))
      return reject("Repeated canonical IDs require the separate same-ID chain review");
    ids.add(event.eventId);
    aggregateKeys.add(key);
    if(event.aggregateType==="staff_shift_rules"){
      if(typeof event.localPayload.name!=="string" || !event.localPayload.name.trim() ||
         typeof event.localPayload.startTime!=="string" ||
         typeof event.localPayload.endTime!=="string" ||
         typeof event.localPayload.unpaidBreakMinutes!=="number" ||
         !Number.isSafeInteger(event.localPayload.unpaidBreakMinutes) ||
         typeof event.localPayload.active!=="boolean" ||
         event.localPayload.branchId!==event.remotePayload.branchId)
        return reject("Shift revision is incomplete or changes its canonical branch");
    }else{
      const local=event.localPayload,remote=event.remotePayload,peers=event.sameDayCloudPeers;
      if(typeof local.staffId!=="string" || !local.staffId ||
         typeof local.workDate!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(local.workDate) ||
         typeof local.shiftRuleId!=="string" || !local.shiftRuleId ||
         !["scheduled","cancelled"].includes(String(local.status)) ||
         local.staffId!==remote.staffId || local.workDate!==remote.workDate ||
         local.branchId!==remote.branchId ||
         !Array.isArray(peers) || peers.length!==1 || !object(peers[0]) ||
         peers[0].id!==event.aggregateId || peers[0].staffId!==remote.staffId ||
         peers[0].workDate!==remote.workDate ||
         peers[0].shiftRuleId!==remote.shiftRuleId ||
         peers[0].branchId!==remote.branchId ||
         peers[0].status!==remote.status ||
         peers[0].version!==event.remoteVersion)
        return reject("Roster staff/day identity or authoritative visible Cloud peer is missing or inconsistent");
    }
  }

  // Device-local sequence is the only trustworthy local ordering primitive.
  // A gap could hide a dependency not included in the bounded sealed vault.
  events.sort((a,b)=>a.sequence-b.sequence);
  for(let i=1;i<events.length;i++)
    if(events[i].sequence!==events[i-1].sequence+1)
      return reject("Original device sequence contains a duplicate or gap; dependency ordering is unverified");

  const slots=events.filter(e=>e.aggregateType==="staff_roster_slots");
  const staffDays=new Set<string>();
  for(const slot of slots){
    const day=slot.localPayload.staffId+":"+slot.localPayload.workDate;
    if(staffDays.has(day))
      return reject("Different roster IDs target the same staff/day; server-side conflict resolution required");
    staffDays.add(day);
  }

  // A referenced unconfirmed shift must appear before its assignment.
  // Even a successful order cannot prove there are no unobserved Cloud records.
  const shifts=new Map(events.filter(e=>e.aggregateType==="staff_shift_rules")
    .map(e=>[e.aggregateId,e]));
  const steps:MultiIdReviewStep[]=[];
  for(const event of events){
    const prerequisites:string[]=[];
    if(event.aggregateType==="staff_roster_slots"){
      const shift=shifts.get(String(event.localPayload.shiftRuleId));
      if(shift){
        if(shift.sequence>=event.sequence)
          return reject("An unconfirmed shift dependency follows its roster assignment");
        // A roster might already refer to a shift's historical time; changing
        // its schedule via an unordered crash recovery is prohibited.
        if(shift.localPayload.startTime!==shift.remotePayload?.startTime ||
           shift.localPayload.endTime!==shift.remotePayload?.endTime ||
           shift.localPayload.unpaidBreakMinutes!==shift.remotePayload?.unpaidBreakMinutes ||
           shift.localPayload.branchId!==shift.remotePayload?.branchId)
          return reject("Dependent shift changes historical time/branch; explicit Cloud reconciliation required");
        prerequisites.push(shift.eventId);
      }
    }
    steps.push({eventId:event.eventId,aggregateId:event.aggregateId,
      aggregateType:event.aggregateType,deviceSequence:event.sequence,prerequisites});
  }
  if(steps.length!==events.length || new Set(steps.map(s=>s.aggregateId)).size!==steps.length)
    return reject("Different canonical records cannot be ordered unambiguously");
  return {reviewOrderAvailable:true,reason:"Provisional device-local order for human review only",
    automaticRecoveryAllowed:false,steps};
}
