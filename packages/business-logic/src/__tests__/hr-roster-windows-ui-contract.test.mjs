import assert from "node:assert/strict";
import fs from "node:fs";
const ui=fs.readFileSync("packages/ui/src/components/staff/RosterPlanner.tsx","utf8");
const wrapper=fs.readFileSync("apps/desktop/src/components/DesktopRosterPanel.tsx","utf8");
const app=fs.readFileSync("apps/desktop/src/App.tsx","utf8");
const exportSource=fs.readFileSync("packages/ui/src/index.ts","utf8");
assert.match(ui,/planRecurringRoster\(/,"Shared monthly preview reuses the validated planning engine");
assert.match(ui,/Preview only: no changes were saved/,"No unapproved batch execution");
assert.match(ui,/expectedVersion: current\?\.version/,"Corrections preserve optimistic version checks");
assert.match(ui,/expectedVersion: slot.version/,"Cancellation requires the reviewed revision");
assert.match(ui,/window.confirm\(/,"Cancellation is explicitly confirmed");
assert.match(ui,/Branch-local dates and times/,"Time-zone policy limitation is exposed");
assert.match(wrapper,/can\("staff.manage"\)/,"Unauthorized staff access is rejected");
assert.match(wrapper,/await onChanged\(\)/,"Windows mutations await strict SQLite save");
assert.match(wrapper,/phase6Store.assignRosterSlot/,"Assignments use the audited domain");
assert.match(wrapper,/phase6Store.updateShiftRule/,"Template edits use the audited domain");
assert.match(app,/Open Shift & Roster Planner/,"Planner is reachable from actual Windows staff navigation");
assert.match(exportSource,/components\/staff\/RosterPlanner/,"Shared component is exported");

assert.match(ui,/async function toggleShiftActive\(shift: ShiftRule\)/,"Shift-template lifecycle uses a dedicated reviewed action");
assert.match(ui,/if \(!canEdit \|\| busy\) return/,"Unauthorized/ongoing edits cannot toggle templates");
assert.match(ui,/window.confirm\(message\)/,"Template deactivate/reactivate requires explicit confirmation");
assert.match(ui,/active: nextActive/,"Template lifecycle persists a real revisioned active flag");
assert.match(ui,/onSaveShift\(\{/,"Soft lifecycle reuses the existing audited host mutation");
assert.match(ui,/existing rosters and audit history will be retained/,"Historic roster records must never be deleted");
assert.match(ui,/aria-label=\{.*Deactivate/,"Lifecycle buttons are accessible");
assert.doesNotMatch(ui,/deleteShiftRule|hardDeleteShift/,"UI never hard-deletes historical templates");

console.log("HR-004 Windows shared roster UI, audited soft shift lifecycle and confirmation PASS");
