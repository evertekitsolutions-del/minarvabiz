import * as React from "react";
import { RosterPlanner } from "@minarvabiz/ui";
import { phase6Store, phase9Store, can } from "@minarvabiz/business-logic";
import type { StaffMember } from "@minarvabiz/types";

export function DesktopRosterPanel({staff, onChanged, onError}:{
  staff: StaffMember[];
  onChanged: () => Promise<void>;
  onError: (error: string) => void;
}) {
  if (!can("staff.manage")) return <p role="alert">You do not have permission to edit the workforce roster.</p>;
  const changed = async (mutation: () => void) => {
    try {
      mutation();
      // SQLite failures must remain visible and must never become silent
      // localStorage-only success; App supplies its strict write callback.
      await onChanged();
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); throw e; }
  };
  return <RosterPlanner staff={[...staff,...phase6Store.listArchivedStaff()]}
    shifts={phase6Store.listShiftRules(true)} slots={phase6Store.listRosterSlots()}
    branches={phase9Store.listBranches()} canEdit={can("staff.manage")}
    onSaveShift={(input,id) => changed(() => {
      if (id) phase6Store.updateShiftRule(id,input);
      else phase6Store.createShiftRule(input);
    })}
    onSaveSlot={(input,policy) => changed(() => { phase6Store.assignRosterSlot(input,policy); })}
  />;
}
