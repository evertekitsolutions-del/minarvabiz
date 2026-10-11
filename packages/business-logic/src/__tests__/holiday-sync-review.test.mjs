import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(module,file)=>module._compile(ts.transpileModule(
 fs.readFileSync(file,"utf8"),{fileName:file,compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
 esModuleInterop:true,inlineSourceMap:true,inlineSources:true
 }}).outputText,file);
const {reviewHolidayRevisionSnapshots}=require("../holiday-sync-review.ts");
const orgId="10000000-0000-4000-8000-000000000001";
const rule=(num,version=1)=>({
 id:"a5000000-0000-4000-8000-"+String(num).padStart(12,"0"),
 orgId,scope:"organization",branchId:null,countryCode:null,
 date:"2026-10-11",repeatsAnnually:false,name:"Configured company day",
 treatment:"non_working",active:true,version
});
const local=[
 rule(1),rule(2,1),rule(3,3),rule(4),rule(5),rule(6)
];
const cloud=[
 rule(1),rule(2,2),rule(3,2),
 {...rule(4),name:"Same revision altered without audit"},
 rule(6,1),rule(7)
];
const original=structuredClone({local,cloud});
const result=reviewHolidayRevisionSnapshots({orgId,local,cloud});
assert.deepEqual(result.map(x=>[x.kind,x.localVersion,x.cloudVersion]),[
 ["identical",1,1],
 ["cloud_newer_review",1,2],
 ["local_newer_unverified",3,2],
 ["same_version_divergence",1,1],
 ["local_only_unverified",1,null],
 ["identical",1,1],
 ["cloud_only_unverified",null,1],
]);
assert.deepEqual({local,cloud},original,"No writes or input mutation permitted");
assert.deepEqual(reviewHolidayRevisionSnapshots({orgId,local:[],cloud:[]}),[]);
assert.deepEqual(reviewHolidayRevisionSnapshots({orgId,local:[],cloud:[rule(1)]})
 .map(x=>x.kind),["cloud_only_unverified"]);
assert.deepEqual(reviewHolidayRevisionSnapshots({orgId,local:[rule(1)],cloud:[]})
 .map(x=>x.kind),["local_only_unverified"]);
for(const malformed of [
 {...rule(1),orgId:"20000000-0000-4000-8000-000000000002"},
 {...rule(1),version:0},
 {...rule(1),date:"2026-02-30"},
 {...rule(1),branchId:"foreign-branch",scope:"branch"},
]){
 assert.throws(()=>reviewHolidayRevisionSnapshots({
 orgId,local:[malformed],cloud:[]}),/organization|holiday|identity|date|branch|snapshot/i);
}
assert.throws(()=>reviewHolidayRevisionSnapshots({
 orgId,local:[rule(1),rule(1)],cloud:[]}),/Duplicate/);
assert.throws(()=>reviewHolidayRevisionSnapshots({
 orgId:"another-company",local,cloud}),/organization identity/);
assert.throws(()=>reviewHolidayRevisionSnapshots({
 orgId,local,cloud:[...cloud,rule(1)]}),/Duplicate/);
const source=fs.readFileSync("packages/business-logic/src/holiday-sync-review.ts","utf8");
assert.doesNotMatch(source,/fetch\(|pgRpc|saveAttendance|writeAttendance|hydrateHolidayCache\(|enqueueOutbox|sendCloud|mergeHoliday|localStorage|setTimeout/);
const index=fs.readFileSync("packages/business-logic/src/index.ts","utf8");
assert.match(index,/export \* as holidaySyncReview from "\.\/holiday-sync-review"/);
const ui=fs.readFileSync("apps/web/src/components/roster/RosterHolidayCalendar.tsx","utf8");
assert.match(ui,/reviewHolidayRevisionSnapshots/);
assert.match(ui,/holidayCache\.listHolidayCache/);
assert.match(ui,/Compare Cloud and Offline revisions/);
assert.doesNotMatch(ui,/hydrateHolidayCache\(|applyHolidayRevision\(/);
console.log("HR005 bounded tenant-pinned Web/SQLite offline vs Cloud holiday reconciliation preview PASS");
