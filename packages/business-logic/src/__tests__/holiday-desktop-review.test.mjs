import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(module,file)=>module._compile(ts.transpileModule(
 fs.readFileSync(file,"utf8"),{fileName:file,compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
  esModuleInterop:true,inlineSourceMap:true,inlineSources:true,
 }}).outputText,file);
const permissions=require("../permissions.ts");
const cache=require("../holiday-cache.ts");
const calendar=require("../holiday-calendar.ts");
const orgId="10000000-0000-4000-8000-000000000001";
const anotherOrgId="20000000-0000-4000-8000-000000000002";
const branchId="b1000000-0000-4000-8000-000000000001";
const otherBranchId="b1000000-0000-4000-8000-000000000002";
const createRule=(id,scope,date,treatment="non_working")=>({
 id:"a5000000-0000-4000-8000-"+String(id).padStart(12,"0"),
 orgId,scope,countryCode:scope==="country"?"IN":null,
 branchId:scope==="branch"?branchId:null,date,repeatsAnnually:false,
 name:"Configured company "+id,treatment,active:true,version:1,
});
const rules=[
 createRule(1,"branch","2026-10-15"),
 createRule(2,"country","2026-10-16"),
 createRule(3,"organization","2026-10-15","informational"),
 {...createRule(4,"organization","2024-02-29"),repeatsAnnually:true},
];
permissions.setCurrentRole("admin");
cache.hydrateHolidayCache(rules);
const before=cache.exportHolidayCache();
const context={orgId,branchId,countryCode:"IN"};
const days=calendar.previewHolidayCalendar({
 rules:cache.listHolidayCache(),from:"2026-10-14",to:"2026-10-17",context
});
assert.deepEqual(days.map(d=>d.treatment),[
 "none","needs_review","non_working","none"
]);
const roster=calendar.previewRosterHolidayReview({
 rules:cache.listHolidayCache(),context,
 slots:[
  {id:"slot-1",workDate:"2026-10-15",branchId,status:"scheduled"},
  {id:"slot-2",workDate:"2026-10-16",branchId,status:"scheduled"},
  {id:"slot-3",workDate:"2026-10-15",branchId:otherBranchId,status:"scheduled"},
  {id:"slot-4",workDate:"2026-10-16",branchId,status:"cancelled"},
 ]
});
assert.deepEqual(roster.map(x=>[x.slotId,x.treatment]),[
 ["slot-1","needs_review"],["slot-2","non_working"]
]);
const attendance=calendar.previewAttendanceHolidayReview({
 rules:cache.listHolidayCache(),context,from:"2026-10-15",to:"2026-10-17",
 attendance:[
  {id:"a1",staffId:"s1",date:"2026-10-15",branchId,status:"present"},
  {id:"a2",staffId:"s2",date:"2026-10-16",branchId,status:"present"},
  {id:"a3",staffId:"s3",date:"2026-10-15",branchId:otherBranchId,status:"present"},
 ]
});
assert.deepEqual(attendance.map(x=>[x.attendanceId,x.reason]),[
 ["a1","contradictory_rules"],["a2","nonworking_day_requires_review"]
]);
assert.deepEqual(cache.exportHolidayCache(),before,"Review must not change the SQLite cache");
assert.deepEqual(calendar.previewHolidayCalendar({
 rules:cache.listHolidayCache(),from:"2026-10-15",to:"2026-10-15",
 context:{orgId:anotherOrgId,branchId,countryCode:"IN"}
})[0].holidays,[],"Foreign organization rules must never appear");
const noBranch=calendar.previewHolidayCalendar({
 rules:cache.listHolidayCache(),from:"2026-10-15",to:"2026-10-15",
 context:{orgId,branchId:null,countryCode:null}
})[0];
assert.deepEqual(noBranch.holidays.map(x=>x.id),[rules[2].id],
 "No branch/country context must exclude branch/country-only policies");
assert.equal(calendar.previewHolidayCalendar({
 rules:cache.listHolidayCache(),from:"2028-02-29",to:"2028-02-29",context
})[0].holidays.length,1,"Leap-day recurring holiday still applies in leap years");
assert.equal(calendar.previewHolidayCalendar({
 rules:cache.listHolidayCache(),from:"2027-02-28",to:"2027-02-28",context
})[0].holidays.length,0,"Leap-day holidays cannot shift to February 28");
permissions.setCurrentRole("cashier");
assert.throws(()=>cache.listHolidayCache(),/permission/i);
permissions.setCurrentRole("admin");
const ui=fs.readFileSync("apps/desktop/src/components/DesktopHolidayReviewPanel.tsx","utf8");
const rosterUi=fs.readFileSync("apps/desktop/src/components/DesktopRosterPanel.tsx","utf8");
const app=fs.readFileSync("apps/desktop/src/App.tsx","utf8");
assert.match(ui,/can\("staff\.manage"\)/);
assert.match(ui,/holidayCache\.listHolidayCache\(\)/);
assert.match(ui,/holidayCache\.validateHolidayCache\(rules\)/);
assert.match(ui,/phase6Store\.listRosterSlots\(from,to\)/);
assert.match(ui,/phase6Store\.listAttendance\(\{from,to\}\)/);
assert.match(ui,/previewHolidayCalendar/);
assert.match(ui,/previewRosterHolidayReview/);
assert.match(ui,/previewAttendanceHolidayReview/);
assert.match(ui,/does not fetch or authorize Cloud policy/);
assert.doesNotMatch(ui,/(?:\.|\b)(?:saveStaffHoliday|hydrateHolidayCache|setAttendance|assignRosterSlot|pgRpc|fetch\(|enqueueOutbox|scheduleAutoSave|localStorage\.setItem)/);
assert.match(rosterUi,/DesktopHolidayReviewPanel/);
assert.match(app,/view==="roster"&&<DesktopRosterPanel/);
console.log("HR005 desktop offline holiday preview scoped rules/roster/attendance, RBAC, no mutation and UI route PASS");
