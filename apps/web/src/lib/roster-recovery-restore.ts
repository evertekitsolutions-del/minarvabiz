/**
 * HR-004B restricted, explicit crash recovery.
 * Reconstruct exactly ONE reviewed same-ID update into local Web memory.
 * There is NO network write or automatic replay here. The manager must press
 * the existing Retry button separately after inspecting the pending event.
 */
import {
  can, exportOutbox, getRemoteWriter, getRemoteWriterGeneration,
  getSessionToken, getSessionUser, hydrateOutbox, phase6Store,
  type LocalOutboxEvent, type workforceRoster,
} from "@minarvabiz/business-logic";
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
