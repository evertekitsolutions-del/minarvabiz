/**
 * HR-004B read-only, fail-closed review of a bounded encrypted recovery batch.
 *
 * This is an EXPLANATION ONLY: it never authorizes replay, discard, local
 * hydration, merge, or an assumption that RLS-hidden records do not exist.
 * The inputs originate from an authorized, scoped Cloud comparison; this
 * function performs no I/O and adds no new storage or transport dependencies.
 */
import type { SealedRosterCloudComparison } from "./roster-recovery-checkpoint";

export interface RosterDependencyFinding {
  key: string;
  kind: "cloud-uncertain" | "same-record" | "shift-before-slot" |
    "same-day-different-id" | "sequence-collision" | "incomplete-batch";
  eventIds: string[];
  message: string;
}

export interface RosterRecoveryDependencyReview {
  /** Number of compared events; not permission to act on any of them. */
  reviewedCount: number;
  total: number;
  completeBatch: boolean;
  findings: RosterDependencyFinding[];
  /** Deliberately hardcoded: this analysis cannot authorize a mutation. */
  automaticRecoveryAllowed: false;
}

type Comparison = SealedRosterCloudComparison;
function value(record: Record<string, unknown>, name: string): string | null {
  const v=record[name];
  return typeof v==="string" && v.length>0 ? v : null;
}
function identity(event: Comparison) {
  if (!event || typeof event.eventId!=="string" || !event.eventId ||
      typeof event.aggregateId!=="string" || !event.aggregateId ||
      (event.aggregateType!=="staff_shift_rules" && event.aggregateType!=="staff_roster_slots") ||
      !["insert","update","delete"].includes(event.eventType) ||
      typeof event.deviceId!=="string" || !event.deviceId ||
      !Number.isSafeInteger(event.sequence) || event.sequence<1 ||
      !Number.isSafeInteger(event.localVersion) || event.localVersion<1 ||
      !event.localPayload || typeof event.localPayload!=="object" ||
      Array.isArray(event.localPayload) ||
      event.localPayload.id!==event.aggregateId ||
      event.localPayload.version!==event.localVersion ||
      (event.remotePresence!=="visible" && event.remotePresence!=="missing-or-hidden") ||
      (event.remotePresence==="visible" &&
        (!event.remotePayload || event.remotePayload.id!==event.aggregateId ||
         event.remoteVersion===null || !Number.isSafeInteger(event.remoteVersion) ||
         event.remoteVersion<1)) ||
      (event.remotePresence==="missing-or-hidden" &&
        (event.remotePayload!==null || event.remoteVersion!==null))) {
    throw new Error("Malformed or ambiguous scoped roster recovery comparison");
  }
  if (event.aggregateType==="staff_roster_slots" &&
      (!value(event.localPayload,"staffId") || !value(event.localPayload,"workDate") ||
       !value(event.localPayload,"shiftRuleId")))
    throw new Error("Roster assignment dependencies lack required identity");
}
export function analyzeSealedRosterDependencies(
  report:{comparisons:readonly Comparison[];total:number},
):RosterRecoveryDependencyReview {
  if (!report || !Array.isArray(report.comparisons) ||
      !Number.isSafeInteger(report.total) || report.total<0 ||
      report.comparisons.length>25 || report.comparisons.length>report.total)
    throw new Error("Invalid bounded roster recovery review");
  const events=[...report.comparisons];
  const keys=new Set<string>();
  for(const event of events){
    identity(event);
    if(keys.has(event.eventId))throw new Error("Duplicate recovery event identity");
    keys.add(event.eventId);
  }
  const findings:RosterDependencyFinding[]=[];
  const add=(kind:RosterDependencyFinding["kind"],eventIds:string[],message:string)=>{
    findings.push({kind,eventIds,key:kind+":"+eventIds.join(":"),message});
  };
  const completeBatch=events.length===report.total;
  if(!completeBatch)add("incomplete-batch",[],
    `Only ${events.length} of ${report.total} sealed events were compared. Dependencies outside this page are unknown; leave all events quarantined.`);

  for(const event of events){
    if(event.remotePresence==="missing-or-hidden"){
      add("cloud-uncertain",[event.eventId],
        "Cloud record is missing or hidden by authorization. Never infer permission to recreate it.");
    }else if(event.eventType!=="update" ||
      event.remoteVersion===null || event.localVersion!==event.remoteVersion+1){
      add("cloud-uncertain",[event.eventId],
        "Cloud state/revision is not an isolated same-ID update. Manual conflict review is required.");
    }
  }
  for(let i=0;i<events.length;i++)for(let j=i+1;j<events.length;j++){
    const first=events[i],second=events[j];
    if(first.deviceId===second.deviceId && first.sequence===second.sequence){
      add("sequence-collision",[first.eventId,second.eventId],
        "Two immutable events share one device sequence. Ordering cannot be trusted.");
    }
    if(first.aggregateType===second.aggregateType && first.aggregateId===second.aggregateId){
      const order=first.deviceId===second.deviceId &&
        first.sequence!==second.sequence ? " The lower device sequence must be reviewed first." :
        " Different devices or duplicate sequences prevent an authoritative replay order.";
      add("same-record",[first.eventId,second.eventId],
        "Multiple pending changes target the same canonical roster record."+order);
    }
    const shift=first.aggregateType==="staff_shift_rules"?first:
      second.aggregateType==="staff_shift_rules"?second:null;
    const slot=first.aggregateType==="staff_roster_slots"?first:
      second.aggregateType==="staff_roster_slots"?second:null;
    if(shift && slot && value(slot.localPayload,"shiftRuleId")===shift.aggregateId){
      const order=shift.deviceId===slot.deviceId && shift.sequence<slot.sequence
        ? " Shift event precedes assignment in this device's sequence."
        : " Required ordering is not established; verify original dependencies.";
      add("shift-before-slot",[shift.eventId,slot.eventId],
        "An unconfirmed roster assignment references an unconfirmed shift."+order);
    }
    if(first.aggregateType==="staff_roster_slots" &&
       second.aggregateType==="staff_roster_slots" &&
       first.aggregateId!==second.aggregateId &&
       value(first.localPayload,"staffId")===value(second.localPayload,"staffId") &&
       value(first.localPayload,"workDate")===value(second.localPayload,"workDate")){
      add("same-day-different-id",[first.eventId,second.eventId],
        "Different canonical assignment IDs target the same staff/day. Potential cross-device collision; never last-write-wins.");
    }
  }
  return {reviewedCount:events.length,total:report.total,completeBatch,
    findings,automaticRecoveryAllowed:false};
}
