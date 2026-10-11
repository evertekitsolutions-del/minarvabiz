/**
 * HR-004B: deterministic authorization-independent eligibility preflight for
 * explicit LOCAL restoration of a same-canonical-ID chain. It never modifies
 * storage, sends events, or authorizes a Cloud write.
 *
 * Only the recovery authority can re-read the tenant-scoped sealed backup and
 * fresh RLS Cloud state before applying the plan.
 */
import type { SealedRosterCloudComparison } from "./roster-recovery-checkpoint";

export type ChainReview = {
  scope:{userId:string;organizationId:string};
  total:number;
  comparisons:SealedRosterCloudComparison[];
};
export type ChainPlan =
  | {eligible:false;reason:string}
  | {eligible:true;aggregateType:SealedRosterCloudComparison["aggregateType"];
     aggregateId:string;eventIds:string[];cloudVersion:number;finalVersion:number};

const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const fail=(reason:string):ChainPlan=>({eligible:false,reason});
function record(raw:unknown):raw is Record<string,unknown>{
  return raw!==null && typeof raw==="object" && !Array.isArray(raw);
}
/**
 * Refuse partial review, mixed records/devices, unsorted/duplicate event IDs,
 * breaks in optimistic version history, changed Cloud baselines, hidden peers
 * and any ambiguous field identity. A green plan alone is NOT restore authority.
 */
export function planReviewedSealedRosterChain(input:ChainReview):ChainPlan {
  if(!input || !record(input.scope) || typeof input.scope.userId!=="string" ||
     !input.scope.userId || typeof input.scope.organizationId!=="string" ||
     !input.scope.organizationId || !Array.isArray(input.comparisons) ||
     !Number.isSafeInteger(input.total) || input.total<2 || input.total>25 ||
     input.comparisons.length!==input.total)
    return fail("A complete 2–25 event scoped recovery review is required");
  const events=input.comparisons;
  const first=events[0];
  if(!first || !["staff_roster_slots","staff_shift_rules"].includes(first.aggregateType) ||
     typeof first.aggregateId!=="string" || !first.aggregateId ||
     typeof first.deviceId!=="string" || !first.deviceId ||
     !record(first.remotePayload) || first.remotePresence!=="visible" ||
     !Number.isSafeInteger(first.remoteVersion) || (first.remoteVersion??0)<1 ||
     first.remotePayload.id!==first.aggregateId)
    return fail("A visible canonical Cloud baseline is required");
  const base=first.remotePayload;
  const baseRevision=first.remoteVersion as number;
  const ids=new Set<string>();
  let previousSequence=0;
  for(let i=0;i<events.length;i++){
    const event=events[i];
    if(!event || typeof event.eventId!=="string" || !event.eventId ||
       ids.has(event.eventId) || event.aggregateId!==first.aggregateId ||
       event.aggregateType!==first.aggregateType || event.deviceId!==first.deviceId ||
       event.eventType!=="update" ||
       (event.localStatus!=="pending" && event.localStatus!=="failed") ||
       !Number.isSafeInteger(event.sequence) || event.sequence<=previousSequence ||
       !Number.isSafeInteger(event.localVersion) ||
       event.localVersion!==baseRevision+i+1 ||
       event.remoteVersion!==baseRevision || event.remotePresence!=="visible" ||
       !record(event.remotePayload) || !equal(event.remotePayload,base) ||
       !record(event.localPayload) || event.localPayload.id!==first.aggregateId ||
       event.localPayload.version!==event.localVersion)
      return fail("Original events are not one immutable, ordered, consecutive same-ID revision chain");
    ids.add(event.eventId);
    previousSequence=event.sequence;
    if(event.aggregateType==="staff_roster_slots"){
      if(event.localPayload.staffId!==base.staffId ||
         event.localPayload.workDate!==base.workDate ||
         event.localPayload.branchId!==base.branchId ||
         typeof event.localPayload.shiftRuleId!=="string" ||
         !["scheduled","cancelled"].includes(String(event.localPayload.status)))
        return fail("Roster staff/date/branch identity or assignment contents cannot be safely restored");
      // This is only a visible same-day snapshot; a hidden/concurrent record
      // can still exist, and final server write must independently enforce it.
      const peers=event.sameDayCloudPeers;
      if(!Array.isArray(peers) || peers.length!==1 ||
         !record(peers[0]) || peers[0].id!==first.aggregateId ||
         peers[0].staffId!==base.staffId || peers[0].workDate!==base.workDate ||
         peers[0].version!==baseRevision)
        return fail("Cloud same-day assignment peers are missing, ambiguous or changed");
    } else {
      if(typeof event.localPayload.name!=="string" || !event.localPayload.name.trim() ||
         typeof event.localPayload.startTime!=="string" ||
         typeof event.localPayload.endTime!=="string" ||
         !Number.isSafeInteger(event.localPayload.unpaidBreakMinutes) ||
         typeof event.localPayload.active!=="boolean" ||
         event.localPayload.branchId!==base.branchId)
        return fail("Shift identity, branch or contents cannot be safely restored");
    }
  }
  return {eligible:true,aggregateType:first.aggregateType,
    aggregateId:first.aggregateId,eventIds:[...ids],
    cloudVersion:baseRevision,finalVersion:baseRevision+events.length};
}
