import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {buildStaffLeavePlan}=require("../staff-leave-preview.ts");
const staff=[{id:"s1",name:"Sam",status:"active",branchId:"b1"},
 {id:"s2",name:"John",status:"inactive",branchId:"b1"}];
const input={staffId:"s1",leaveType:"annual",fromDate:"2026-10-23",toDate:"2026-10-27",
isHalfDay:false,includeWeekends:false,reason:"Family engagement"};
const run=(patch={},members=staff,branch="b1")=>buildStaffLeavePlan({...input,...patch},members,branch);

test("working-day leave skips Saturday and Sunday using timezone-free calendar dates",()=>{
 const p=run();
 assert.deepEqual(p.days.map(d=>d.date),["2026-10-23","2026-10-26","2026-10-27"]);
 assert.equal(p.countedDays,3);
 assert.equal(p.excludedWeekendDays,2);
 assert.equal(p.staffName,"Sam");
 assert.deepEqual(p.days.map(d=>d.weekday),["Friday","Monday","Tuesday"]);
});
test("half-day and weekend-included modes supported without mutating records",()=>{
 const original=JSON.stringify([input,staff]);
 const p=run({fromDate:"2026-10-24",toDate:"2026-10-24",includeWeekends:true,isHalfDay:true});
 assert.equal(p.countedDays,0.5);
 assert.equal(p.days[0].date,"2026-10-24");
 assert.equal(JSON.stringify([input,staff]),original);
 assert.throws(()=>run({fromDate:"2026-10-24",toDate:"2026-10-24",isHalfDay:true}),/no counted/);
});
test("validates date ranges, leap days, half-days and duration bound",()=>{
 for(const date of ["2026-02-29","2026/10/23","2026-13-23",""]){
   assert.throws(()=>run({fromDate:date}),/date/);
 }
 assert.throws(()=>run({toDate:"2026-10-01"}),/1 to 180/);
 assert.throws(()=>run({toDate:"2027-10-23"}),/1 to 180/);
 assert.throws(()=>run({isHalfDay:true}),/single/);
 const leap=run({fromDate:"2028-02-28",toDate:"2028-03-01"});
 assert.deepEqual(leap.days.map(x=>x.date),["2028-02-28","2028-02-29","2028-03-01"]);
});
test("staff status, branch, deleted and leave type are checked",()=>{
 assert.throws(()=>run({staffId:"s2"}),/inactive/);
 assert.throws(()=>run({staffId:"none"}),/inactive/);
 assert.throws(()=>run({},staff,"b2"),/branch/);
 assert.throws(()=>run({},[{...staff[0],deletedAt:"2026-01-01"}]),/inactive/);
 assert.throws(()=>run({leaveType:"invalid"}),/category/);
 assert.throws(()=>run({reason:"x".repeat(501)}),/500/);
});
test("CSV protects user-controlled staff and reason from formulas",()=>{
 const p=run({reason:'=HYPERLINK("bad")'},[{...staff[0],name:"@Employee"}]);
 assert.match(p.csv,/"'@Employee"/);
 assert.match(p.csv,/"'=HYPERLINK\(""bad""\)"/);
 assert.equal(p.csv.split("\r\n").length-2,p.days.length);
});
test("Web and Windows staff management mounts HR-006 leave planner",()=>{
 const widget=fs.readFileSync(new URL("../../../ui/src/components/staff/StaffLeavePlanner.tsx",import.meta.url),"utf8");
 const host=fs.readFileSync(new URL("../../../ui/src/components/staff/StaffList.tsx",import.meta.url),"utf8");
 assert.match(widget,/Preview leave dates/);
 assert.match(widget,/Export leave CSV/);
 assert.match(widget,/buildStaffLeavePlan/);
 assert.match(host,/<StaffLeavePlanner/);
});
