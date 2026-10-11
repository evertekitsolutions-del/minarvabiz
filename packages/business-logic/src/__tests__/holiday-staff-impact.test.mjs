import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(module,file)=>module._compile(ts.transpileModule(
 fs.readFileSync(file,"utf8"),{fileName:file,compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
 esModuleInterop:true,inlineSourceMap:true,inlineSources:true
 }}).outputText,file);
const {reviewHolidayStaffImpact}=require("../holiday-sync-review.ts");
const orgId="10000000-0000-4000-8000-000000000001";
const branchId="b1000000-0000-4000-8000-000000000001";
const otherBranch="b1000000-0000-4000-8000-000000000002";
const rule=(n,date,treatment="non_working")=>({
 id:"a5000000-0000-4000-8000-"+String(n).padStart(12,"0"),
 orgId,scope:"branch",countryCode:null,branchId,date,
 repeatsAnnually:false,name:"Authorized holiday "+n,
 treatment,active:true,version:1
});
const input={
 orgId,context:{orgId,branchId,countryCode:null},
 from:"2026-10-15",to:"2026-10-16",
 local:[rule(1,"2026-10-15")],
 cloud:[{...rule(1,"2026-10-15","informational"),version:2},
        rule(2,"2026-10-16")],
 slots:[
  {id:"s15",workDate:"2026-10-15",branchId,status:"scheduled"},
  {id:"s16",workDate:"2026-10-16",branchId,status:"scheduled"},
  {id:"cancelled",workDate:"2026-10-15",branchId,status:"cancelled"},
  {id:"other",workDate:"2026-10-15",branchId:otherBranch,status:"scheduled"},
 ],
 attendance:[
  {id:"a15",staffId:"person15",date:"2026-10-15",branchId,status:"present"},
  {id:"a16",staffId:"person16",date:"2026-10-16",branchId,status:"present"},
  {id:"foreign",staffId:"person17",date:"2026-10-15",branchId:otherBranch,status:"present"},
 ]
};
const before=structuredClone(input),changed=reviewHolidayStaffImpact(input);
assert.deepEqual(changed.map(x=>[x.category,x.recordId,x.localReview,x.cloudReview]),[
 ["attendance","a15","nonworking_day_requires_review",null],
 ["roster","s15","non_working",null],
 ["attendance","a16",null,"nonworking_day_requires_review"],
 ["roster","s16",null,"non_working"],
]);
assert.equal(changed.some(x=>["foreign","other","cancelled"].includes(x.recordId)),false);
assert.deepEqual(input,before,"No source rows can be mutated");
assert.deepEqual(reviewHolidayStaffImpact({...input,cloud:input.local}),[]);
assert.deepEqual(reviewHolidayStaffImpact({
 ...input,cloud:[{...input.local[0],version:2,name:"Renamed"}]
}),[],"Non-effective metadata changes belong in revision review, not staff impact");
assert.deepEqual(reviewHolidayStaffImpact({...input,slots:[],attendance:[]}),[],
 "No authorized staff records means no person-level assertions");
assert.deepEqual(reviewHolidayStaffImpact({
 ...input,local:[],cloud:[rule(3,"2026-10-15")],slots:[input.slots[2]],
 attendance:[]
}),[],"Cancelled shifts cannot imply staff impact");
assert.deepEqual(reviewHolidayStaffImpact({
 ...input,context:{orgId,branchId:otherBranch,countryCode:null},
 slots:[],attendance:[]
}),[],"Explicit other-branch context must not leak selected branch impact");
for(const bad of [
 {...input,orgId:"20000000-0000-4000-8000-000000000002"},
 {...input,context:{...input.context,orgId:"20000000-0000-4000-8000-000000000002"}},
 {...input,cloud:[{...rule(1,"2026-10-15"),orgId:"20000000-0000-4000-8000-000000000002"}]},
 {...input,local:[input.local[0],input.local[0]]},
 {...input,from:"2026-10-16",to:"2026-10-15"},
 {...input,to:"2027-11-30"},
 {...input,slots:[{...input.slots[0],workDate:"2026-10-17"}]},
 {...input,attendance:[{...input.attendance[0],date:"2026-10-14"}]},
 {...input,slots:Array(5001).fill(input.slots[0])},
 {...input,attendance:Array(5001).fill(input.attendance[0])},
 {...input,slots:[input.slots[0],input.slots[0]]},
 {...input,attendance:[input.attendance[0],{...input.attendance[0],id:"duplicate-person-day"}]},
 {...input,slots:[{...input.slots[0],workDate:"2026-02-30"}]},
 {...input,attendance:[{...input.attendance[0],status:"paid"}]},
]){
 assert.throws(()=>reviewHolidayStaffImpact(bad),
  /organization|holiday|duplicate|bounded|ordered|limited|outside|malformed|invalid/i,
  "Malformed tenant/scope/staff snapshots must fail closed");
}
const source=fs.readFileSync("packages/business-logic/src/holiday-sync-review.ts","utf8");
const ui=fs.readFileSync("apps/web/src/components/roster/RosterHolidayCalendar.tsx","utf8");
assert.match(source,/reviewHolidayStaffImpact/);
assert.doesNotMatch(source,/fetch\\(|pgRpc|saveAttendance|writeAttendance|hydrateHolidayCache\\(|enqueueOutbox|sendCloud|mergeHoliday|localStorage|setTimeout/);
assert.match(ui,/reviewHolidayStaffImpact/);
assert.match(ui,/Holiday staff review impact results/);
assert.match(ui,/phase6Store\\.listRosterSlots\\(from,to\\)/);
assert.match(ui,/phase6Store\\.listAttendance\\(\\{from,to\\}\\)/);
assert.doesNotMatch(ui,/applyHolidayRevision\\(|automaticHolidaySync\\(/);
console.log("HR005 read-only staff impact: roster/attendance delta, branches, bounds, identity and no-write PASS");
