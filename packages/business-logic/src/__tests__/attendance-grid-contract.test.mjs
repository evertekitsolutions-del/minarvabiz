import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");

const read=(p)=>fs.readFileSync(p,"utf8");
const types=read("packages/types/src/index.ts");
const store=read("packages/business-logic/src/phase6-store.ts");
const nav=read("packages/ui/src/lib/nav.ts");
const page=read("apps/web/src/app/(app)/attendance/page.tsx")+read("packages/ui/src/components/staff/AttendanceGrid.tsx");
const migration=read("supabase/migrations/20261008_attendance_grid.sql");
const persistence=read("packages/business-logic/src/persistence.ts");
const desktop=read("apps/desktop/src/App.tsx");
const desktopPanel=read("apps/desktop/src/components/DesktopAttendancePanel.tsx");

assert.match(types,/StaffAttendanceRecord/);
assert.match(types,/present.*absent.*half_day.*leave.*holiday/);
assert.match(store,/setAttendance/);
assert.match(store,/listAttendance/);
assert.match(store,/attendanceSummary/);
assert.match(store,/enqueueOutbox\("staff_attendance"/);
assert.match(store,/auditAction\(existing\?"attendance.update":"attendance.create"/);
assert.match(store,/attendance:\[\.\.\.attendance\]/);
assert.match(store,/input\.attendance/);
assert.match(nav,/Attendance Grid/);
assert.match(desktop,/view==="attendance"/);
assert.match(desktop,/DesktopAttendancePanel/);
assert.match(desktopPanel,/AttendanceGrid/);
assert.match(desktopPanel,/setAttendance/);
assert.match(persistence,/SNAPSHOT_VERSION = 15/);
assert.match(persistence,/attendance: phase6\.attendance/);
assert.match(persistence,/attendance: snap\.attendance/);
assert.match(page,/All present today/);
assert.match(page,/Holiday today/);
assert.match(page,/AttendanceGrid/);
assert.match(page,/saveAttendance/);
assert.match(page,/overtimeMinutes/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.staff_attendance/);
assert.match(migration,/UNIQUE \(org_id, staff_id, attendance_date\)/);
assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
assert.match(migration,/FORCE ROW LEVEL SECURITY/);
assert.match(migration,/user_org_ids\(\)/);
assert.match(migration,/CHECK \(status IN \('present','absent','half_day','leave','holiday'\)\)/);
console.log("Attendance Grid contract PASS");

assert.match(desktop,/onChanged=\{persistAttendanceAndRefresh\}/,"Attendance save must use a persistence callback that reports failures");
assert.match(desktop,/Attendance changes are not yet saved to SQLite/);

const persistenceBody=desktop.match(/const persistAttendanceAndRefresh = React\.useCallback\(async \(\) => \{([\s\S]*?)\}, \[refreshAll\]\)/)?.[1];
assert.ok(persistenceBody,"Strict attendance persistence callback must exist");
assert.doesNotMatch(persistenceBody,/scheduleAutoSave|localStorage/,"Failed attendance writes must never be hidden in transient browser storage");
const makePersist=new Function("refreshAll","persistDomainToSqlite",`return async()=>{${persistenceBody}}`);
let refreshes=0;
const successful=makePersist(()=>refreshes++,async()=>true);
await successful();assert.equal(refreshes,1);
await assert.rejects(makePersist(()=>refreshes++,async()=>false),/not yet saved/);
assert.equal(refreshes,2,"Rejected save must refresh UI and remain visible");
const diskError=new Error("disk write failed");
await assert.rejects(makePersist(()=>refreshes++,async()=>{throw diskError}),e=>e===diskError);
assert.equal(refreshes,3,"Disk errors remain visible and preserve UI refresh");
// Exercise the extracted persistence boundary: swallowing a rejected write,
// reporting success before acknowledgement, or hiding the error must fail here.
const source = read("apps/desktop/src/lib/desktop-persistence.ts");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
let write = async () => true;
new Function("require", "exports", "console", compiled)(specifier => {
  assert.equal(specifier, "./sqlite-bootstrap");
  return { persistDomainToSqlite: () => write() };
}, exports, { error() {} });
let domainRefreshes = 0;
const messages = [];
const callbacks = exports.createDesktopPersistence(() => domainRefreshes++, message => messages.push(message));
assert.match(desktop, /createDesktopPersistence\(refreshAll, setModuleError\)/);
assert.match(desktop, /onPersist=\{persistCustomerCollection\}/);

let acknowledge;
write = () => new Promise(resolve => { acknowledge = resolve; });
let completed = false;
const saving = callbacks.persistCustomerCollection().then(result => { completed = true; return result; });
await Promise.resolve();
assert.equal(completed, false, "Collection must await native acknowledgement");
acknowledge(true);
assert.equal(await saving, true);
assert.equal(messages.length, 0);

for (const failure of [false, new Error("disk full"), "native IPC disconnected"]) {
  write = async () => { if (failure === false) return false; throw failure; };
  assert.equal(await callbacks.persistCustomerCollection(), false);
  assert.match(messages.at(-1), /SQLite customer payment save failed/);
  assert.match(messages.at(-1), /retry/i);
  assert.equal(await callbacks.persistAndRefresh(), undefined);
  assert.equal(await callbacks.persistProductAndRefresh(), false);
  assert.match(messages.at(-1), /SQLite domain save failed/);
}
assert.equal(messages.length, 6, "Every rejected write must be visible");
assert.equal(domainRefreshes, 7);
write = async () => true;
assert.equal(await callbacks.persistCustomerCollection(), true, "A later native retry can succeed");
assert.equal(messages.length, 6, "Successful retry must not report a new error");
console.log("Attendance SQLite confirmation/failure behavior PASS");
