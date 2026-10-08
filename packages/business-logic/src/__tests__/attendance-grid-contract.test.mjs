import assert from "node:assert/strict";
import fs from "node:fs";

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
assert.match(persistence,/SNAPSHOT_VERSION = 13/);
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

assert.match(desktop,/onChanged=\{persistAttendanceAndRefresh\}/,"Attendance save must report persistence failures");
assert.match(desktop,/createPersistenceHandlers\(refreshAll,persistDomainToSqlite,scheduleAutoSave\)/);

const persistenceSource=fs.readFileSync(new URL("../../../../apps/desktop/src/lib/attendance-persistence.ts",import.meta.url),"utf8");
const {createRequire}=await import("node:module");
const ts=createRequire(import.meta.url)("typescript");
const exported={};
new Function("exports",ts.transpileModule(persistenceSource,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exported);
const makePersist=(refresh,persist,retry)=>()=>exported.persistAttendanceChange(refresh,persist,retry);
let refreshes=0,retries=0;
await makePersist(()=>refreshes++,async()=>true,()=>retries++)();
assert.equal(refreshes,1);assert.equal(retries,0);
await assert.rejects(makePersist(()=>refreshes++,async()=>false,()=>retries++),/not yet saved/);
assert.equal(retries,1,"unconfirmed save keeps autosave retry");
const diskError=new Error("disk write failed");
await assert.rejects(makePersist(()=>refreshes++,async()=>{throw diskError},()=>retries++),e=>e===diskError);
assert.equal(retries,2,"disk errors remain visible and retryable");
console.log("Attendance SQLite confirmation/failure behavior PASS");

await exported.persistBusinessChange(()=>refreshes++,async()=>false,()=>retries++);
await exported.persistBusinessChange(()=>refreshes++,async()=>{throw diskError},()=>retries++);
assert.equal(retries,4,"general business autosave fallback behavior remains unchanged");

await exported.createPersistenceHandlers(()=>{},async()=>true,()=>{}).persistAttendanceAndRefresh();
