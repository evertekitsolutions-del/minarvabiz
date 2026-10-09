"use client";
import * as React from "react";
import { RosterPlanner } from "@minarvabiz/ui";
import {
  can, exportOutbox, getRemoteWriter, getRuntimeMode, phase6Store, phase9Store,
} from "@minarvabiz/business-logic";
import { isRosterHydrated } from "@/lib/data-source";
import { checkpointUnconfirmedRosterEvents, inspectSealedRosterCheckpoint } from "@/lib/roster-recovery-checkpoint";

/**
 * Authorized browser roster editor. Mutations stay on the shared domain/outbox,
 * then the server's audited PostgreSQL RPC confirms the original event IDs.
 * No direct DML, service-role credential, silent replay or last-write-wins.
 */
export default function RosterPage() {
  const [ready, setReady] = React.useState(false);
  const [problem, setProblem] = React.useState("");
  const [syncProblem, setSyncProblem] = React.useState("");
  const [resolutionMessage, setResolutionMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [recoveryState, setRecoveryState] = React.useState<"checking" | "ready" | "blocked" | "unavailable">("checking");
  const [recoveryCount, setRecoveryCount] = React.useState(0);
  const [hydrationEpoch, setHydrationEpoch] = React.useState(0);
  const [review, setReview] = React.useState<
    Awaited<ReturnType<typeof phase6Store.reviewWorkforceRosterConflict>> | null
  >(null);
  const inFlight = React.useRef(false);
  const [, redraw] = React.useReducer((n: number) => n + 1, 0);

  const unsent = exportOutbox().filter(e =>
    (e.aggregateType === "staff_shift_rules" || e.aggregateType === "staff_roster_slots") &&
    (e.status === "pending" || e.status === "failed"));

  React.useEffect(() => {
    setReady(getRuntimeMode() === "demo" || isRosterHydrated());
    const hydrated = (event: Event) => {
      const detail = (event as CustomEvent<{ok?:boolean; message?:string}>).detail;
      if (detail?.ok) {
        setReady(getRuntimeMode() === "demo" || isRosterHydrated());
        setProblem(""); setSyncProblem(""); setReview(null); setResolutionMessage(""); setRecoveryState("checking"); setHydrationEpoch(n=>n+1); redraw();
      } else {
        setReady(false); setReview(null); setRecoveryState("checking"); setHydrationEpoch(n=>n+1);
        setProblem(detail?.message || "Roster cloud hydration failed");
      }
    };
    window.addEventListener("minarva:data-hydrated", hydrated);
    return () => window.removeEventListener("minarva:data-hydrated", hydrated);
  }, []);

  // Current user+organization are resolved through the authenticated RPC.
  // A sealed unconfirmed event is quarantined on reload, never auto-replayed.
  React.useEffect(() => {
    if (!ready || !isRosterHydrated()) return;
    let cancelled=false;
    setRecoveryState("checking");
    void inspectSealedRosterCheckpoint().then(result=>{
      if (cancelled) return;
      setRecoveryCount(result.events.length);
      setRecoveryState(result.events.length ? "blocked" : "ready");
    }).catch(error=>{
      if (cancelled) return;
      setRecoveryState("unavailable");
      setSyncProblem(error instanceof Error?error.message:String(error));
    });
    return ()=>{cancelled=true;};
  }, [ready,hydrationEpoch]);

  // Warn before closing until the confirmed identity has been durably cleared.
  // Keep the warning active until the exact events are acknowledged by RPC.
  React.useEffect(() => {
    if (!unsent.length) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsent.length]);

  const writerReady = Boolean(getRemoteWriter()?.upsertRosterEvent);
  const scopedReady = ready && (getRuntimeMode() === "demo" || isRosterHydrated());
  const editable = scopedReady && isRosterHydrated() && recoveryState === "ready" && can("staff.manage") && writerReady && !busy && unsent.length === 0;

  async function commit(action: () => void): Promise<void> {
    if (!ready || !isRosterHydrated() || recoveryState !== "ready" || !can("staff.manage") || !getRemoteWriter()?.upsertRosterEvent) {
      throw new Error("An authorized roster session and atomic cloud writer are required");
    }
    if (inFlight.current || exportOutbox().some(e =>
      (e.aggregateType === "staff_shift_rules" || e.aggregateType === "staff_roster_slots") &&
      (e.status === "pending" || e.status === "failed"))) {
      throw new Error("Review or retry the existing unconfirmed roster events first");
    }
    inFlight.current = true; setBusy(true); setSyncProblem(""); setResolutionMessage(""); setReview(null);
    try {
      const pinnedWriter=getRemoteWriter();
      const restored=await inspectSealedRosterCheckpoint();
      if (restored.events.length || !isRosterHydrated() || getRemoteWriter()!==pinnedWriter) {
        setRecoveryState("blocked");
        throw new Error("An earlier sealed roster event or changed session requires reviewed recovery");
      }
      action();
      redraw(); // Make the unconfirmed local version visibly pending immediately.
      // Do not send a cloud RPC before its original immutable event is sealed.
      const originalIds=exportOutbox().filter(e=>(e.aggregateType==="staff_shift_rules"||
        e.aggregateType==="staff_roster_slots")&&(e.status==="pending"||e.status==="failed")).map(e=>e.id);
      await checkpointUnconfirmedRosterEvents();
      await phase6Store.flushWorkforceRosterOutbox();
      await checkpointUnconfirmedRosterEvents(originalIds);
    } catch (error) {
      setSyncProblem(error instanceof Error ? error.message : String(error));
      throw error; // The planner reports failure; no false save acknowledgement.
    } finally {
      inFlight.current = false; setBusy(false); redraw();
    }
  }

  async function retryPending() {
    if (!ready || !isRosterHydrated() || recoveryState !== "ready" || !can("staff.manage") ||
        !getRemoteWriter()?.upsertRosterEvent || inFlight.current) return;
    if (!window.confirm("Retry the original unconfirmed roster events in order? No conflicting cloud revision will be overwritten.")) return;
    inFlight.current = true; setBusy(true); setSyncProblem(""); setResolutionMessage(""); setReview(null);
    try {
      const originals=exportOutbox().filter(e=>(e.aggregateType==="staff_shift_rules"||
        e.aggregateType==="staff_roster_slots")&&(e.status==="pending"||e.status==="failed")).map(e=>e.id);
      await checkpointUnconfirmedRosterEvents();
      await phase6Store.flushWorkforceRosterOutbox();
      await checkpointUnconfirmedRosterEvents(originals);
    } catch (error) {
      setSyncProblem(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.current = false; setBusy(false); redraw();
    }
  }

  async function reviewPendingEvent(eventId: string) {
    if (!isRosterHydrated() || !can("staff.manage") || inFlight.current) return;
    inFlight.current = true; setBusy(true); setSyncProblem(""); setResolutionMessage(""); setReview(null);
    try {
      const compared = await phase6Store.reviewWorkforceRosterConflict(eventId);
      setReview(compared);
    } catch (error) {
      setSyncProblem(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.current = false; setBusy(false);
    }
  }

  async function acceptCloudVersion() {
    if (!review || !isRosterHydrated() || recoveryState !== "ready" || !can("staff.manage") || inFlight.current) return;
    const warning = review.remote
      ? "Keep the current Cloud version and discard this one unconfirmed local change? The original event and audit history are retained. Other dependent events are blocked."
      : "No Cloud record exists. Discard this unconfirmed local creation? The original event history is retained. This cannot be undone.";
    if (!window.confirm(warning)) return;
    inFlight.current = true; setBusy(true); setSyncProblem(""); setResolutionMessage("");
    try {
      await phase6Store.keepCloudWorkforceRosterConflict(review);
      await checkpointUnconfirmedRosterEvents([review.eventId]);
      setReview(null);
      setResolutionMessage("Cloud version retained after reviewed conflict resolution. The original local event remains in history as discarded.");
    } catch (error) {
      setSyncProblem(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.current = false; setBusy(false); redraw();
    }
  }

  async function reapplyReviewedLocal() {
    if (!review || !review.remote || !isRosterHydrated() || recoveryState !== "ready" ||
        !can("staff.manage") || !getRemoteWriter()?.upsertRosterEvent || inFlight.current) return;
    if (!window.confirm(
      "Submit the reviewed local correction as a NEW revision over the current Cloud version? " +
      "This will retain the original rejected event in history. A changed Cloud revision, " +
      "dependent events, staff/date identity mismatch or historical shift change will be refused."
    )) return;
    inFlight.current = true; setBusy(true); setSyncProblem(""); setResolutionMessage("");
    try {
      const confirmed = await phase6Store.reapplyLocalWorkforceRosterConflict(review,
        async () => { await checkpointUnconfirmedRosterEvents([review.eventId]); });
      await checkpointUnconfirmedRosterEvents([review.eventId,confirmed.eventId]);
      setReview(null);
      setResolutionMessage(
        "Reviewed local correction confirmed by the audited Cloud RPC at revision " +
        confirmed.version + ". Superseded event retained in the local history."
      );
    } catch (error) {
      // The old event may already be superseded by a new failed/pending event.
      // Clear the now-stale comparison so the current event can be reviewed.
      setReview(null);
      setSyncProblem((error instanceof Error ? error.message : String(error)) +
        " If a revised event is pending, keep this tab open and use Review or Retry.");
    } finally {
      inFlight.current = false; setBusy(false); redraw();
    }
  }

  if (!can("staff.manage")) return <p role="alert">You do not have permission to view workforce rosters.</p>;
  // Do not expose stale previous-tenant data when authenticated hydration failed.
  if (!scopedReady) return <p role={problem ? "alert" : "status"}>{problem || "Loading authorized shift and roster data…"}</p>;

  return <div className="space-y-3">
    {recoveryState === "checking" && <p role="status">Checking encrypted organization-scoped roster recovery before editing…</p>}
    {recoveryState === "blocked" && <div role="alert" className="rounded border border-amber-400 p-3">
      Encrypted recovery contains {recoveryCount} unconfirmed roster event(s) for this authorized account.
      New edits are blocked to preserve the original records. No automatic replay or overwrite was performed.
      Keep this browser profile for an explicit recovery/import review.
    </div>}
    {recoveryState === "unavailable" && <p role="alert">Roster recovery storage or authorization is unavailable; Web editing is disabled to prevent silent data loss.</p>}
    {unsent.length > 0 && <div role="alert" className="rounded border border-amber-300 p-3 text-sm">
      {unsent.length} unconfirmed roster event(s); original identities retained. Pending events are encrypted before the Cloud RPC;
      do not close or reload this tab. Version conflicts require explicit reviewed resolution, never automatic overwrite.
      <button className="ml-3 rounded border px-3 py-1" type="button"
        disabled={busy || !writerReady} onClick={() => void retryPending()}>
        {busy ? "Sending…" : "Retry original events"}
      </button>
      <ul className="mt-2 space-y-2">
        {unsent.map(event => <li key={event.id} className="flex flex-wrap items-center gap-2">
          <span>{event.aggregateType === "staff_shift_rules" ? "Shift" : "Roster"} · {event.status} · event {event.id}</span>
          <button className="rounded border px-2 py-1" type="button"
            disabled={busy || !isRosterHydrated() ||
              !(event.aggregateType === "staff_shift_rules"
                ? getRemoteWriter()?.getRosterShift : getRemoteWriter()?.getRosterSlot)}
            onClick={() => void reviewPendingEvent(event.id)}>
            Review local vs Cloud
          </button>
        </li>)}
      </ul>
    </div>}
    {review && <section aria-label="Read-only roster conflict comparison" className="rounded border p-3">
      <h3 className="font-semibold">Reviewed event {review.eventId}</h3>
      <p className="text-sm">Read-only tenant-scoped comparison. No local or remote changes were made. A separate audited resolution decision is required.</p>
      {review.error && <p className="text-sm">Last write error: {review.error}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <div><h4>Unconfirmed local version</h4><pre className="max-h-64 overflow-auto text-xs">{JSON.stringify(review.local,null,2)}</pre></div>
        <div><h4>Current authorized Cloud version</h4><pre className="max-h-64 overflow-auto text-xs">{review.remote ? JSON.stringify(review.remote,null,2) : "No remote record; creation may not have reached the server."}</pre></div>
      </div>
      <button className="mt-3 rounded border px-3 py-2" type="button"
        disabled={busy || unsent.length !== 1 || !isRosterHydrated()}
        onClick={() => void acceptCloudVersion()}>
        {review.remote ? "Keep current Cloud version" : "Discard unsynced local creation"}
      </button>
      {review.remote && <button className="mt-3 ml-2 rounded border px-3 py-2" type="button"
        disabled={busy || unsent.length !== 1 || !isRosterHydrated() || !writerReady}
        onClick={() => void reapplyReviewedLocal()}>
        Reapply reviewed local correction
      </button>}
      <p className="mt-2 text-sm">Reapply Local creates a new audited revision and retains the rejected event.
        Missing Cloud records, different-ID same-day assignments, dependent events and unreviewed changes
        require separate manual recovery; no automatic force overwrite.</p>
    </section>}
    {resolutionMessage && <p role="status" className="rounded border p-3 text-sm">{resolutionMessage}</p>}
    {syncProblem && <p role="alert" className="rounded border border-rose-300 p-3 text-sm">{syncProblem}</p>}
    <p role="status" className="text-sm text-slate-600">
      {writerReady
        ? "Authenticated tenant-scoped editor: changes are confirmed only after the audited atomic cloud RPC succeeds."
        : "Read-only: an authenticated atomic roster writer is unavailable."}
    </p>
    <RosterPlanner staff={[...phase6Store.listStaff(), ...phase6Store.listArchivedStaff()]}
      shifts={phase6Store.listShiftRules(true)}
      slots={phase6Store.listRosterSlots()}
      branches={phase9Store.listBranches()} canEdit={editable}
      onSaveShift={(input, id) => commit(() => {
        if (id) phase6Store.updateShiftRule(id, input);
        else phase6Store.createShiftRule(input);
      })}
      onSaveSlot={(input, policy) => commit(() => { phase6Store.assignRosterSlot(input, policy); })}/>
  </div>;
}
