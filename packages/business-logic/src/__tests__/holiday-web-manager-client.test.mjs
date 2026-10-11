import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(module,file)=>module._compile(ts.transpileModule(
 fs.readFileSync(file,"utf8"),{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true
 }}).outputText,file);
const holidayCalendar=require("../holiday-calendar.ts");
const oldLoad=Module._load;
Module._load=function(name,parent,isMain){
 if(name==="@minarvabiz/business-logic")return {holidayCalendar};
 return oldLoad.apply(this,arguments);
};
let createHolidayManagerClient,validateHolidayEdit;
try{({createHolidayManagerClient,validateHolidayEdit}=
 require("../../../../apps/web/src/lib/holiday-client.ts"));}
finally{Module._load=oldLoad;}

const org="10000000-0000-4000-8000-000000000001",
 branch="c1000000-0000-4000-8000-000000000001",
 id="a5000000-0000-4000-8000-000000000001";
const input={id,scope:"branch",countryCode:null,branchId:branch,
 date:"2026-10-11",repeatsAnnually:true,name:"Configured branch holiday",
 treatment:"non_working",active:true,expectedVersion:0};
const raw=(version=1)=>({id,org_id:org,scope:"branch",country_code:null,
 branch_id:branch,holiday_on:"2026-10-11",repeats_annually:true,
 name:"Configured branch holiday",treatment:"non_working",active:true,version});
let generation=1,authorized=true,reads=0,writes=0,reply=null,seenArgs=null;
const client=createHolidayManagerClient({
 authorize:async()=>({orgId:org,role:authorized?"manager":"cashier",
   ensureCurrent:()=>{if(generation!==1)throw Error("Session changed");}}),
 read:async()=>{reads++;return [raw()]},
 write:async args=>{writes++;seenArgs=args;return reply;}
});
const list=await client.list();
assert.equal(list.orgId,org);
assert.equal(list.rules.length,1);
assert.equal(list.rules[0].orgId,org);
validateHolidayEdit(input);
reply={accepted:true,record:raw(),attendance_payroll_enforcement_active:false};
assert.deepEqual((await client.save(input)).rule,list.rules[0]);
assert.equal(writes,1);
assert.equal(seenArgs.p_expected_version,0);
assert.equal(seenArgs.p_date,input.date);
reply={accepted:false,reason:"stale_revision",remote:raw(2)};
const stale=await client.save(input);
assert.equal(stale.accepted,false);
assert.equal(stale.remote.version,2);
reply={accepted:false,reason:"not_found"};
const missing=await client.save(input);
assert.equal(missing.accepted,false);
assert.equal(missing.remote,null);
reply={accepted:true,record:raw(9),attendance_payroll_enforcement_active:false};
await assert.rejects(()=>client.save(input),/identity\/version/);
reply={accepted:true,record:raw(),attendance_payroll_enforcement_active:true};
await assert.rejects(()=>client.save(input),/enforcement status/);
assert.equal(writes,5);
authorized=false;
await assert.rejects(()=>client.list(),/manager/);
await assert.rejects(()=>client.save(input),/manager/);
assert.equal(writes,5,"Cashier cannot issue RPC write");
authorized=true;
generation=2;
await assert.rejects(()=>client.list(),/Session changed/);
await assert.rejects(()=>client.save(input),/Session changed/);
assert.equal(writes,5);
generation=1;
for(const broken of [
 {...input,id:"bad"},
 {...input,scope:"country",countryCode:"IN",branchId:branch},
 {...input,branchId:"another-tenant"},
 {...input,name:""},
 {...input,date:"2026-02-30"},
 {...input,expectedVersion:-1},
])assert.throws(()=>validateHolidayEdit(broken));
const foreign=createHolidayManagerClient({
 authorize:async()=>({orgId:org,role:"admin",ensureCurrent:()=>{}}),
 read:async()=>[{...raw(),org_id:"20000000-0000-4000-8000-000000000002"}],
 write:async()=>{throw Error("should not write")}
});
await assert.rejects(()=>foreign.list(),/tenant mismatch/);
const duplicated=createHolidayManagerClient({
 authorize:async()=>({orgId:org,role:"admin",ensureCurrent:()=>{}}),
 read:async()=>[raw(),raw()],
 write:async()=>{throw Error("should not write")}
});
await assert.rejects(()=>duplicated.list(),/Duplicate Cloud holiday IDs/);
const revoked=createHolidayManagerClient({
 authorize:async()=>({orgId:org,role:"admin",ensureCurrent:()=>{if(generation!==1)throw Error("Session changed")}}),
 read:async()=>{throw Error("unexpected")},
 write:async()=>{generation=2;return {accepted:true,record:raw(),attendance_payroll_enforcement_active:false}}
});
await assert.rejects(()=>revoked.save(input),/Session changed|identity/);
// Confirm critical boundary remains inside authenticated client and UI does
// not bypass the server RPC or mutate attendance/roster on holiday preview.
const adapter=fs.readFileSync("apps/web/src/lib/holiday-online.ts","utf8");
assert.match(adapter,/NEXT_PUBLIC_HR005_HOLIDAYS_READY/);
assert.match(adapter,/resolveOnlineAuthorization/);
assert.match(adapter,/getRemoteWriterGeneration/);
assert.match(adapter,/save_staff_holiday_rule/);
const component=fs.readFileSync("apps/web/src/components/roster/RosterHolidayCalendar.tsx","utf8");
assert.match(component,/holidayManagementEnabled/);
assert.match(component,/previewRosterHolidayReview/);
assert.doesNotMatch(component,/saveAttendance\(|assignRosterSlot\(|flushWorkforceRosterOutbox\(/);
const page=fs.readFileSync("apps/web/src/app/(app)/roster/page.tsx","utf8");
assert.match(page,/RosterHolidayCalendar/);
console.log("HR005 authenticated holiday RPC/list/tenant/revision/feature-flag/browser-console contract PASS");
