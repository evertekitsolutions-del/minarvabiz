/**
 * HR-004B restricted, explicit crash recovery.
 * Reconstruct exactly ONE reviewed same-ID update into local Web memory.
 * There is NO network write or automatic replay here. The manager must press
 * the existing Retry button separately after inspecting the pending event.
 */
import {
  can, exportOutbox, getRemoteWriter, getRemoteWriterGeneration,
  getSessionToken, getSessionUser, hydrateOutbox, phase6Store,
  type LocalOutboxEvent, workforceRoster,
} from "@minarvabiz/business-logic";
import { planReviewedSealedRosterChain } from "./roster-recovery-chain";
import {
  compareSealedRosterCheckpointWithCloud, inspectSealedRosterCheckpoint,
  type SealedRosterCloudComparison,
} from "./roster-recovery-checkpoint";

type ShiftRule = workforceRoster.ShiftRule;
type RosterSlot = workforceRoster.RosterSlot;
type ApprovedReview = Awaited<ReturnType<typeof compareSealedRosterCheckpointWithCloud>>;
function assertAuthorized(token: string, userId: string, generation: number, writer: ReturnType<typeof getRemoteWriter>) {
  if (!token || getSessionToken() !== token || getSessionUser()?.id !== userId ||
      getRemoteWriterGeneration() !== generation || getRemoteWriter() !== writer || !can("staff.manage")) {
    throw new Error("Roster restoration session or organization changed; original encrypted backup retained");
  }
}
function equal(value: unknown, other: unknown) {
  return JSON.stringify(value) === JSON.stringify(other);
}

/**
 * Never directly retry, mark synced, or clear the encrypted backup.
 * The original ID/device sequence/payload are preserved. If Cloud has advanced
 * since the manager reviewed the data, a new explicit conflict review is needed.
 */
export async function restoreReviewedSealedRosterEventToMemory(
  approved: ApprovedReview,
): Promise<{eventId: string; aggregateType: SealedRosterCloudComparison["aggregateType"]}> {
  const token=getSessionToken();
  const user=getSessionUser();
  const generation=getRemoteWriterGeneration();
  const writer=getRemoteWriter();
  if (!token || !user?.id || !writer?.upsertRosterEvent || !can("staff.manage"))
    throw new Error("Authorized roster manager and authenticated writer are required for restoration");
  if (!approved || approved.total !== 1 || approved.comparisons?.length !== 1)
    throw new Error("Only one independently reviewed sealed roster event can be restored");
  const comparison=approved.comparisons[0];
  if (comparison.localStatus !== "pending" && comparison.localStatus !== "failed")
    throw new Error("Only unconfirmed roster changes may be recovered");
  const localVersion=comparison.localVersion;
  if (!comparison.remotePayload || comparison.remotePresence !== "visible" ||
      comparison.aggregateId !== comparison.remotePayload.id ||
      typeof comparison.remoteVersion !== "number" ||
      !Number.isSafeInteger(localVersion) || localVersion < 2 ||
      localVersion !== comparison.remoteVersion + 1)
    throw new Error("Unsafe Cloud revision or canonical identity; manual reconciliation is required");

  // Capture one fresh tenant-verified snapshot, including current Cloud RLS.
  const fresh=await compareSealedRosterCheckpointWithCloud(1);
  assertAuthorized(token,user.id,generation,writer);
  if (fresh.total !== 1 || !equal(fresh.scope,approved.scope) ||
      !equal(fresh.comparisons[0],comparison))
    throw new Error("Roster Cloud/saved event changed since review; restart recovery");
  const sealed=await inspectSealedRosterCheckpoint();
  assertAuthorized(token,user.id,generation,writer);
  if (!equal(sealed.scope,approved.scope) || sealed.events.length !== 1)
    throw new Error("Roster encrypted recovery scope or event count changed");
  const event=sealed.events[0];
  if (event.id !== comparison.eventId || event.aggregateId !== comparison.aggregateId ||
      event.aggregateType !== comparison.aggregateType ||
      event.status !== comparison.localStatus ||
      !equal(event.payload,comparison.localPayload) ||
      event.eventType !== "update")
    throw new Error("Original immutable roster event changed or is not an authorized update");

  const history=exportOutbox();
  // Other unsent events may depend on this record or belong to a different
  // user/tenant. Fail closed, including unconfirmed unrelated business events.
  if (history.some(e=>e.status==="pending" || e.status==="failed") ||
      history.some(e=>e.id===event.id))
    throw new Error("Existing unconfirmed/duplicate events need independent recovery");
  const previous=phase6Store.exportPhase6State();
  const nextRules=previous.shiftRules.map(r=>({...r}));
  const nextSlots=previous.rosterSlots.map(r=>({...r}));
  const remote=comparison.remotePayload;
  if (comparison.aggregateType==="staff_shift_rules") {
    const position=nextRules.findIndex(rule=>rule.id===event.aggregateId);
    if (position < 0 || !equal(nextRules[position],remote))
      throw new Error("Current local shift does not match the reviewed authorized Cloud snapshot");
    const shift=event.payload as unknown as ShiftRule;
    if (nextSlots.some(slot=>slot.shiftRuleId===shift.id) &&
      (shift.startTime!==remote.startTime || shift.endTime!==remote.endTime ||
       shift.unpaidBreakMinutes!==remote.unpaidBreakMinutes || shift.branchId!==remote.branchId))
      throw new Error("Restoring historical shift timing/branch would rewrite previous assignments");
    nextRules[position]={...shift};
  } else if (comparison.aggregateType==="staff_roster_slots") {
    const position=nextSlots.findIndex(slot=>slot.id===event.aggregateId);
    if (position < 0 || !equal(nextSlots[position],remote))
      throw new Error("Current local assignment does not match the reviewed authorized Cloud snapshot");
    const slot=event.payload as unknown as RosterSlot;
    if (slot.staffId!==remote.staffId || slot.workDate!==remote.workDate ||
        slot.branchId!==remote.branchId)
      throw new Error("Staff/date/branch identity changed; canonical conflict review required");
    nextSlots[position]={...slot};
  } else throw new Error("Unrecognized workforce recovery event");

  assertAuthorized(token,user.id,generation,writer);
  // hydratePhase6 validates the complete proposed roster before replacing it.
  // No await between the in-memory record and immutable outbox restoration.
  const restoredEvent:LocalOutboxEvent={
    ...event,lastError:null, payload:{...event.payload},
  };
  try {
    phase6Store.hydratePhase6({shiftRules:nextRules,rosterSlots:nextSlots});
    hydrateOutbox([...history,restoredEvent]);
  } catch(error) {
    phase6Store.hydratePhase6({shiftRules:previous.shiftRules,rosterSlots:previous.rosterSlots});
    hydrateOutbox(history);
    throw error;
  }
  // The vault remains encrypted and intact; next explicit Retry first checks
  // exact original ID and payload against it before sending an authorized RPC.
  return {eventId:event.id,aggregateType:comparison.aggregateType};
}

/**
 * HR-004B explicit *local-only* recovery of a strict 2–25-event, single-ID
 * consecutive update chain. Never replay, acknowledge, remove, or alter the
 * encrypted source; the manager must separately verify and retry original IDs.
 *
 * All events must share one Cloud revision and the same authorized user,
 * organization and writer throughout two fresh Cloud reads and a vault read.
 * Canonical identity, device sequence, dependent shifts and date-peer
 * ambiguities fail closed. Does not grant authority for other multi-ID batches.
 */
export async function restoreReviewedSealedRosterChainToMemory(
  approved: ApprovedReview,
):Promise<{eventIds:string[];finalVersion:number}> {
  const plan=planReviewedSealedRosterChain(approved);
  if(!plan.eligible)throw Error("Unsafe ordered roster recovery: "+plan.reason);
  const token=getSessionToken();
  const user=getSessionUser();
  const generation=getRemoteWriterGeneration();
  const writer=getRemoteWriter();
  if(!token || !user?.id || !writer?.upsertRosterEvent || !can("staff.manage"))
    throw Error("Authorized roster manager and authenticated writer required for chain recovery");
  const fresh=await compareSealedRosterCheckpointWithCloud(25);
  assertAuthorized(token,user.id,generation,writer);
  if(!equal(fresh,approved))
    throw Error("Cloud or encrypted roster chain changed since review; repeat comparison");
  const freshPlan=planReviewedSealedRosterChain(fresh);
  if(!freshPlan.eligible || !equal(freshPlan,plan))
    throw Error("Authorized ordered roster recovery plan changed");
  const sealed=await inspectSealedRosterCheckpoint();
  assertAuthorized(token,user.id,generation,writer);
  if(!equal(sealed.scope,approved.scope) || sealed.events.length!==plan.eventIds.length)
    throw Error("Encrypted recovery chain count or tenant identity changed");
  const chain=sealed.events;
  for(let i=0;i<chain.length;i++){
    const e=chain[i],c=approved.comparisons[i];
    if(e.id!==plan.eventIds[i] || e.id!==c.eventId ||
       e.aggregateId!==plan.aggregateId || e.aggregateType!==plan.aggregateType ||
       e.deviceId!==c.deviceId || e.sequence!==c.sequence ||
       e.eventType!=="update" || e.status!==c.localStatus ||
       !equal(e.payload,c.localPayload))
      throw Error("Immutable sealed recovery chain differs from the reviewed snapshot");
  }
  const history=exportOutbox();
  // Never replace a different session's pending operation. Any pre-existing
  // identifier also blocks silent duplicate restoration of an acknowledged event.
  if(history.some(e=>e.status==="pending"||e.status==="failed"||
     plan.eventIds.includes(e.id)))
    throw Error("Existing unconfirmed or duplicate outbox events require separate reconciliation");
  const previous=phase6Store.exportPhase6State();
  const shifts=previous.shiftRules.map(s=>({...s}));
  const slots=previous.rosterSlots.map(s=>({...s}));
  const first=approved.comparisons[0];
  const baseline=first.remotePayload;
  if(!baseline)throw Error("Canonical recovery Cloud baseline is unavailable");
  const last=approved.comparisons.at(-1);
  if(!last)throw Error("Recovery chain is empty");
  if(plan.aggregateType==="staff_shift_rules"){
    const position=shifts.findIndex(s=>s.id===plan.aggregateId);
    if(position<0 || !equal(shifts[position],baseline))
      throw Error("Hydrated shift no longer matches the authorized Cloud baseline");
    for(const c of approved.comparisons){
      const next=c.localPayload as unknown as ShiftRule;
      if(slots.some(s=>s.shiftRuleId===plan.aggregateId) &&
         (next.startTime!==baseline.startTime || next.endTime!==baseline.endTime ||
          next.unpaidBreakMinutes!==baseline.unpaidBreakMinutes ||
          next.branchId!==baseline.branchId))
        throw Error("Historical shift timing and branch cannot change through recovery chain");
      // Use existing shared domain validator for EACH intermediate revision.
      // Invalid intermediate steps cannot be safely replayed in sequence.
      workforceRoster.validateShiftRule(next);
    }
    shifts[position]={...(last.localPayload as unknown as ShiftRule)};
  }else{
    const position=slots.findIndex(s=>s.id===plan.aggregateId);
    if(position<0 || !equal(slots[position],baseline))
      throw Error("Hydrated assignment no longer matches the authorized Cloud baseline");
    for(const c of approved.comparisons){
      const next=c.localPayload;
      if(next.staffId!==baseline.staffId || next.workDate!==baseline.workDate ||
         next.branchId!==baseline.branchId)
        throw Error("Roster staff/date/branch identity cannot change in recovery chain");
      if(!shifts.some(s=>s.id===next.shiftRuleId))
        throw Error("Unrecognized dependent shift in recovery chain");
    }
    slots[position]={...(last.localPayload as unknown as RosterSlot)};
  }
  const originals:LocalOutboxEvent[]=chain.map(e=>({...e,
    payload:{...e.payload},lastError:e.lastError??null}));
  assertAuthorized(token,user.id,generation,writer);
  try{
    phase6Store.hydratePhase6({shiftRules:shifts,rosterSlots:slots});
    hydrateOutbox([...history,...originals]);
  }catch(error){
    phase6Store.hydratePhase6({
      shiftRules:previous.shiftRules,rosterSlots:previous.rosterSlots
    });
    hydrateOutbox(history);
    throw error;
  }
  // No Cloud call or checkpoint mutation. The original sealed events remain
  // byte-for-byte encrypted and the explicit retry path is separately audited.
  return {eventIds:[...plan.eventIds],finalVersion:plan.finalVersion};
}
