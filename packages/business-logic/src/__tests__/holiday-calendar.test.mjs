import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(module,file)=>module._compile(ts.transpileModule(
  fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,
    target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {validateHolidayRule,reviewHolidayDay,previewHolidayCalendar,previewRosterHolidayReview}
  =require("../holiday-calendar.ts");
const ctx={orgId:"tenant-a",branchId:"branch-1",countryCode:"IN"};
const base={id:"holiday-1",orgId:"tenant-a",scope:"country",countryCode:"IN",branchId:null,
  date:"2024-02-29",repeatsAnnually:true,name:"Configured leap day",
  treatment:"non_working",active:true,version:1};
validateHolidayRule(base);
const branch={...base,id:"holiday-2",scope:"branch",countryCode:null,branchId:"branch-1",
  date:"2026-10-15",repeatsAnnually:false,name:"Local closure"};
const org={...base,id:"holiday-3",scope:"organization",branchId:null,countryCode:null,
  date:"2026-10-15",repeatsAnnually:false,name:"Company calendar",treatment:"informational"};
assert.equal(reviewHolidayDay([base],"2028-02-29",ctx).treatment,"non_working");
assert.equal(reviewHolidayDay([base],"2027-02-28",ctx).treatment,"none",
  "Leap day must never silently substitute February 28");
assert.equal(reviewHolidayDay([base],"2027-03-01",ctx).treatment,"none");
assert.equal(reviewHolidayDay([branch,org],"2026-10-15",ctx).treatment,"needs_review",
  "Conflicting holiday treatments must not silently determine payroll/attendance");
assert.deepEqual(reviewHolidayDay([branch],"2026-10-15",
  {...ctx,branchId:"branch-2"}).holidays,[]);
assert.deepEqual(reviewHolidayDay([base],"2028-02-29",
  {...ctx,orgId:"tenant-b"}).holidays,[]);
assert.deepEqual(reviewHolidayDay([base],"2028-02-29",
  {...ctx,countryCode:"OM"}).holidays,[]);
const originals=structuredClone([base,branch,org]);
const preview=previewHolidayCalendar({rules:originals,context:ctx,from:"2026-10-14",to:"2026-10-16"});
assert.deepEqual(preview.map(x=>x.treatment),["none","needs_review","none"]);
assert.deepEqual(originals,[base,branch,org],"Preview is pure and must not alter input");
const roster=[{id:"slot-a",workDate:"2026-10-15",branchId:"branch-1",status:"scheduled"},
 {id:"slot-b",workDate:"2026-10-15",branchId:"branch-1",status:"cancelled"},
 {id:"slot-c",workDate:"2026-10-15",branchId:"branch-2",status:"scheduled"}];
assert.deepEqual(previewRosterHolidayReview({rules:[branch],context:ctx,slots:roster}),[
 {slotId:"slot-a",date:"2026-10-15",treatment:"non_working",holidayIds:["holiday-2"]}
]);
for(const invalid of [
 {...base,date:"2026-02-30"},{...base,version:0},{...base,treatment:"paid"},
 {...base,scope:"branch",countryCode:"IN"},{...base,scope:"country",branchId:"branch-1"},
 {...base,scope:"organization",countryCode:"IN"},{...base,name:""},{...base,orgId:""},
]) assert.throws(()=>validateHolidayRule(invalid));
assert.throws(()=>reviewHolidayDay([base,base],"2028-02-29",ctx),/Duplicate/);
assert.throws(()=>previewHolidayCalendar({rules:[base],context:ctx,
 from:"2026-01-01",to:"2027-12-31"}),/366/);
assert.throws(()=>previewHolidayCalendar({rules:[base],context:ctx,
 from:"2026-10-16",to:"2026-10-15"}),/ordered/);
assert.throws(()=>previewRosterHolidayReview({rules:[branch],context:ctx,
 slots:[roster[0],roster[0]]}),/duplicate/);
const source=fs.readFileSync("packages/business-logic/src/holiday-calendar.ts","utf8");
assert.doesNotMatch(source,/fetch\(|supabase|pgRpc|saveAttendance|saveRoster|hydrateOutbox|setTimeout|Date\.now\(/,
 "Shared read-only holiday engine must not read credentials, mutate payroll or replay events");
const idx=fs.readFileSync("packages/business-logic/src/index.ts","utf8");
assert.match(idx,/export \* as holidayCalendar from "\.\/holiday-calendar"/);
console.log("HR005 tenant-scoped country/branch/org annual and one-off holiday preview, conflicts and roster review PASS");
