"use client";
import * as React from "react";
import { RosterPlanner } from "@minarvabiz/ui";
import { can, exportOutbox, getRuntimeMode, phase6Store, phase9Store } from "@minarvabiz/business-logic";
import { isRosterHydrated } from "@/lib/data-source";

export default function RosterPage() {
  const [ready, setReady] = React.useState(false);
  const [problem, setProblem] = React.useState("");
  const [, redraw] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    setReady(getRuntimeMode() === "demo" || isRosterHydrated());
    const hydrated = (event: Event) => {
      const detail = (event as CustomEvent<{ok?:boolean; message?:string}>).detail;
      if (detail?.ok) { setReady(getRuntimeMode() === "demo" || isRosterHydrated()); setProblem(""); redraw(); }
      else { setReady(false); setProblem(detail?.message || "Roster cloud hydration failed"); }
    };
    window.addEventListener("minarva:data-hydrated", hydrated);
    return () => window.removeEventListener("minarva:data-hydrated", hydrated);
  }, []);
  if (!can("staff.manage")) return <p role="alert">You do not have permission to view workforce rosters.</p>;
  // Do not render stale previous-tenant state before fresh authenticated hydration succeeds.
  if (!ready) return <p role={problem ? "alert" : "status"}>{problem || "Loading authorized shift and roster data…"}</p>;
  const unsent = exportOutbox().filter(e =>
    (e.aggregateType === "staff_shift_rules" || e.aggregateType === "staff_roster_slots") &&
    (e.status === "pending" || e.status === "failed"));
  const readonly = async () => { throw new Error("Web roster editing is disabled until audited conflict recovery and authenticated RPC write parity are verified."); };
  return <div className="space-y-3">
    {unsent.length > 0 && <p role="alert">{unsent.length} unconfirmed workforce events require manual recovery. No roster entries were silently overwritten.</p>}
    <p role="status">Online roster viewer: authenticated tenant-scoped data. Editing is temporarily disabled pending secure conflict/write integration.</p>
    <RosterPlanner staff={[...phase6Store.listStaff(), ...phase6Store.listArchivedStaff()]}
      shifts={phase6Store.listShiftRules(true)}
      slots={phase6Store.listRosterSlots()}
      branches={phase9Store.listBranches()} canEdit={false}
      onSaveShift={readonly} onSaveSlot={readonly}/>
  </div>;
}
