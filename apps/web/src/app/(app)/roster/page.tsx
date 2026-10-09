"use client";
import * as React from "react";
import { RosterPlanner } from "@minarvabiz/ui";
import {
  can, exportOutbox, getRemoteWriter, getRuntimeMode, phase6Store, phase9Store,
} from "@minarvabiz/business-logic";
import { isRosterHydrated } from "@/lib/data-source";

/**
 * Authorized browser roster editor. Mutations stay on the shared domain/outbox,
 * then the server's audited PostgreSQL RPC confirms the original event IDs.
 * No direct DML, service-role credential, silent replay or last-write-wins.
 */
export default function RosterPage() {
  const [ready, setReady] = React.useState(false);
  const [problem, setProblem] = React.useState("");
  const [syncProblem, setSyncProblem] = React.useState("");
  const [busy, setBusy] = React.useState(false);
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
        setProblem(""); setSyncProblem(""); setReview(null); redraw();
      } else {
        setReady(false); setReview(null);
        setProblem(detail?.message || "Roster cloud hydration failed");
      }
    };
    window.addEventListener("minarva:data-hydrated", hydrated);
    return () => window.removeEventListener("minarva:data-hydrated", hydrated);
  }, []);

  // Web outbox currently survives only for the current browser session.
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
  const editable = scopedReady && isRosterHydrated() && can("staff.manage") && writerReady && !busy && unsent.length === 0;

  async function commit(action: () => void): Promise<void> {
    if (!ready || !isRosterHydrated() || !can("staff.manage") || !getRemoteWriter()?.upsertRosterEvent) {
      throw new Error("An authorized roster session and atomic cloud writer are required");
    }
    if (inFlight.current || exportOutbox().some(e =>
      (e.aggregateType === "staff_shift_rules" || e.aggregateType === "staff_roster_slots") &&
      (e.status === "pending" || e.status === "failed"))) {
      throw new Error("Review or retry the existing unconfirmed roster events first");
    }
    inFlight.current = true; setBusy(true); setSyncProblem(""); setReview(null);
    try {
      action();
      redraw(); // Make the unconfirmed local version visibly pending immediately.
      await phase6Store.flushWorkforceRosterOutbox();
    } catch (error) {
      setSyncProblem(error instanceof Error ? error.message : String(error));
      throw error; // The planner reports failure; no false save acknowledgement.
    } finally {
      inFlight.current = false; setBusy(false); redraw();
    }
  }

  async function retryPending() {
    if (!ready || !isRosterHydrated() || !can("staff.manage") ||
        !getRemoteWriter()?.upsertRosterEvent || inFlight.current) return;
    if (!window.confirm("Retry the original unconfirmed roster events in order? No conflicting cloud revision will be overwritten.")) return;
    inFlight.current = true; setBusy(true); setSyncProblem(""); setReview(null);
    try {
      await phase6Store.flushWorkforceRosterOutbox();
    } catch (error) {
      setSyncProblem(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.current = false; setBusy(false); redraw();
    }
  }

  async function reviewPendingEvent(eventId: string) {
    if (!isRosterHydrated() || !can("staff.manage") || inFlight.current) return;
    inFlight.current = true; setBusy(true); setSyncProblem(""); setReview(null);
    try {
      const compared = await phase6Store.reviewWorkforceRosterConflict(eventId);
      setReview(compared);
    } catch (error) {
      setSyncProblem(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight.current = false; setBusy(false);
    }
  }

  if (!can("staff.manage")) return <p role="alert">You do not have permission to view workforce rosters.</p>;
  // Do not expose stale previous-tenant data when authenticated hydration failed.
  if (!scopedReady) return <p role={problem ? "alert" : "status"}>{problem || "Loading authorized shift and roster data…"}</p>;

  return <div className="space-y-3">
    {unsent.length > 0 && <div role="alert" className="rounded border border-amber-300 p-3 text-sm">
      {unsent.length} unconfirmed roster event(s); original identities retained. Browser pending changes are session-only:
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
    </section>}
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
