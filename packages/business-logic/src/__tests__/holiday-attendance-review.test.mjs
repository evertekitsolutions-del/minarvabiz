import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(module,file)=>module._compile(ts.transpileModule(
  fs.readFileSync(file,"utf8"),{fileName:file,compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
    esModuleInterop:true
  }}).outputText,file);
const {previewAttendanceHolidayReview}=require("../holiday-calendar.ts");
const ctx={orgId:"tenant-a",branchId:"branch-a",countryCode:"IN"};
const base={id:"h1",orgId:"tenant-a",scope:"branch",countryCode:null,
  branchId:"branch-a",date:"2026-10-15",repeatsAnnually:false,
  name:"Manager-configured closure",treatment:"non_working",active:true,version:1};
const info={...base,id:"h2",date:"2026-10-17",name:"Company notes",scope:"organization",
  branchId:null,treatment:"informational"};
const conflict={...base,id:"h3",date:"2026-10-17",name:"Other closure"};
const row=(id,date,status,branchId="branch-a",staffId=id)=>({
  id,staffId,date,branchId,status
});
const records=[
  row("r-present","2026-10-15","present"),
  row("r-absent","2026-10-15","absent"),
  row("r-holiday-ok","2026-10-15","holiday"),
  row("r-holiday-unmatched","2026-10-16","holiday"),
  row("r-conflict","2026-10-17","holiday"),
  row("r-scope-unknown","2026-10-18","present",null),
  row("r-other-branch","2026-10-15","present","branch-b"),
  row("r-outside","2026-11-01","holiday")
];
const input={rules:[base,info,conflict],context:ctx,from:"2026-10-15",
  to:"2026-10-18",attendance:records};
const original=structuredClone(input);
const findings=previewAttendanceHolidayReview(input);
assert.deepEqual(findings.map(v=>[v.attendanceId,v.reason]),[
  ["r-absent","nonworking_day_requires_review"],
  ["r-present","nonworking_day_requires_review"],
  ["r-holiday-unmatched","unmatched_holiday_status"],
  ["r-conflict","contradictory_rules"],
  ["r-scope-unknown","branch_scope_unverified"]
].sort((a,b)=>{
  const date=Object.fromEntries(records.map(r=>[r.id,r.date]));
  return date[a[0]].localeCompare(date[b[0]])||a[0].localeCompare(b[0]);
}));
assert.equal(findings.find(v=>v.attendanceId==="r-conflict").holidayIds.length,2);
assert.equal(findings.find(v=>v.attendanceId==="r-holiday-unmatched").holidayIds.length,0);
assert.deepEqual(input,original,"read-only review must not change rules or attendance");
assert.equal(previewAttendanceHolidayReview({...input,context:{...ctx,orgId:"tenant-b"}})
 .filter(x=>x.reason==="nonworking_day_requires_review").length,0,
 "Foreign tenant rules must never apply to employee reviews");
assert.equal(previewAttendanceHolidayReview({...input,rules:[{...base,active:false}]})
 .some(x=>x.reason==="nonworking_day_requires_review"),false,
 "Inactive rules cannot suggest company days off");
assert.deepEqual(previewAttendanceHolidayReview({...input,
 attendance:[row("out","2026-10-15","present","branch-b")]}),[],
 "Explicit other-branch attendance never enters selected branch findings");
for(const broken of [
 {...row("x","2026-10-15","present"),date:"2026-02-30"},
 {...row("x","2026-10-15","present"),status:"paid"},
 {...row("x","2026-10-15","present"),staffId:""},
 {...row("x","2026-10-15","present"),branchId:"   "},
]) assert.throws(()=>previewAttendanceHolidayReview({...input,attendance:[broken]}));
assert.throws(()=>previewAttendanceHolidayReview({...input,attendance:[records[0],{
 ...records[0],id:"different-uuid-but-same-staff-and-date"}]}),/Duplicate staff\/date/);
assert.throws(()=>previewAttendanceHolidayReview({...input,from:"2026-10-18",to:"2026-10-15"}),/ordered/);
assert.throws(()=>previewAttendanceHolidayReview({...input,attendance:Array(5001).fill(records[0])}),/bounded/);
const src=fs.readFileSync("packages/business-logic/src/holiday-calendar.ts","utf8");
assert.doesNotMatch(src,/fetch\(|pgRpc|saveAttendance|assignRosterSlot|setTimeout|hydrateOutbox|Date\.now\(/);
const ui=fs.readFileSync("apps/web/src/components/roster/RosterHolidayCalendar.tsx","utf8");
assert.match(ui,/previewAttendanceHolidayReview/);
assert.match(ui,/phase6Store\.listAttendance/);
assert.doesNotMatch(ui,/phase6Store\.(setAttendance|saveAttendance|assignRosterSlot)/);
console.log("HR005 tenant scoped calendar/attendance discrepancies: 5 explicit review reasons, no payroll/attendance writes PASS");
