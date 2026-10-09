import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename,
);
const code=fs.readFileSync("apps/web/src/lib/data-source-roster.ts","utf8");
const source=fs.readFileSync("apps/web/src/lib/data-source.ts","utf8");
const page=fs.readFileSync("apps/web/src/app/(app)/roster/page.tsx","utf8");
const nav=fs.readFileSync("packages/ui/src/lib/nav.ts","utf8");
const layout=fs.readFileSync("apps/web/src/components/AppLayoutClient.tsx","utf8");
assert.match(code,/pgSelectAll<Row>\(cfg, "staff_shift_rules"/);
assert.match(code,/pgSelectAll<Row>\(cfg, "staff_roster_slots"/);
assert.match(code,/if \(!cfg.accessToken\)/);
assert.match(source,/ensureNoUnconfirmedRosterEvents\(exportOutbox\(\)\)/);
assert.match(source,/rosterRows = await loadCloudRoster\(cfg\)/);
assert.match(source,/rosterRows\.shiftRules, rosterSlots: rosterRows\.rosterSlots/);
assert.match(source,/registerRemoteWriter\(null\)/);
assert.match(page,/if \(!scopedReady\) return/,"Switching tenant must hide prior hydrated roster until current auth completes");
assert.match(page,/canEdit=\{editable\}/,"Authorized browser can edit only behind the authenticated writer gate");
assert.match(page,/isRosterHydrated\(\)/,"Web roster edits require authenticated hydration");
assert.match(page,/can\("staff.manage"\)/,"Web roster actions require staff.manage");
assert.match(page,/getRemoteWriter\(\)\?\.upsertRosterEvent/,"Web editor requires atomic authenticated RPC");
assert.match(page,/flushWorkforceRosterOutbox\(\)/,"Browser must wait for audited event acknowledgements");
assert.match(page,/phase6Store\.assignRosterSlot\(input, policy\)/,"Slot writes use shared core validation and outbox");
assert.match(page,/phase6Store\.updateShiftRule\(id, input\)/,"Shift writes use audited domain");
assert.match(page,/beforeunload/,"Pending browser events need unload protection");
assert.match(page,/Retry original events/,"Explicit replay keeps original immutable event identity");
assert.match(page,/reviewWorkforceRosterConflict\(eventId\)/,"Review must use the permission-checked shared domain");
assert.match(page,/Review local vs Cloud/,"Web shows an explicit comparison affordance");
assert.match(page,/Read-only tenant-scoped comparison/,"Conflict review must not claim a resolution");
assert.match(page,/keepCloudWorkforceRosterConflict\(review\)/,"Approved Cloud resolution uses shared audited domain guard");
assert.match(page,/window\.confirm\(warning\)/,"Cloud replacement requires explicit confirmation");
assert.match(page,/unsent\.length !== 1/,"Dependent events cannot be dropped from the UI");
assert.match(page,/Applying the local correction over Cloud remains disabled/,"Unsafe local rebase stays gated");

assert.match(code,/getRosterShift:/,"Cloud reader must be registered on authenticated writer");
assert.match(code,/getRosterSlot:/,"Roster reader must be registered on authenticated writer");

assert.match(page,/unsent.length === 0/,"Block new mutations while unconfirmed revisions remain");
assert.doesNotMatch(page,/service_role|SUPABASE_SECRET|SUPABASE_SERVICE_ROLE_KEY|pgInsert|pgUpdate|pgRpc/);
assert.match(nav,/href: "\/roster"/);
assert.match(layout,/"\/roster": "roster"/);
assert.doesNotMatch(code,/service_role|SUPABASE_SECRET|SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(page,/pgInsert|pgUpdate|pgRpc/);

const desktop=fs.readFileSync("apps/desktop/src/App.tsx","utf8");
const desktopPolicy=fs.readFileSync("apps/desktop/src/lib/desktop-license-policy.ts","utf8");
assert.match(desktop,/view==="roster"&&<DesktopRosterPanel/,"Windows roster navigation must have real destination");
assert.match(desktopPolicy,/roster: "staff"/,"Desktop roster respects staff entitlement");
const Module=require("node:module"), originalLoad=Module._load;
let failTable="";
let shiftRows, rosterRows;
const row={id:"shift-1",name:"Day",start_time:"09:00:00",end_time:"17:00:00",unpaid_break_minutes:30,branch_id:null,active:true,version:2};
const slot={id:"roster-1",staff_id:"person-1",shift_rule_id:"shift-1",branch_id:null,work_date:"2026-10-09",status:"scheduled",version:3};
shiftRows=[row]; rosterRows=[slot];
const database={
  configFromEnv:()=>({accessToken:"authorized"}),
  pgSelectAll:async(_cfg,table)=>table===failTable?{data:null,error:{message:"RLS denied"}}:{data:table==="staff_shift_rules"?shiftRows:rosterRows,error:null},
};
Module._load=function(name,parent,isMain){
  if(name==="@minarvabiz/database")return database;
  if(name==="@minarvabiz/business-logic")return {
    workforceRoster:require("../workforce-roster.ts"),
    createSupabaseCloudAdapter: () => ({push:async () => ({accepted:[],rejected:[]})}),
  };
  return originalLoad.call(this,name,parent,isMain);
};
let runtime;try{runtime=require("../../../../apps/web/src/lib/data-source-roster.ts");}finally{Module._load=originalLoad;}
assert.deepEqual(runtime.mapCloudShiftRule(row),{
  id:"shift-1",name:"Day",startTime:"09:00",endTime:"17:00",
  unpaidBreakMinutes:30,branchId:null,active:true,version:2,
});
assert.deepEqual(runtime.mapCloudRosterSlot(slot),{
  id:"roster-1",staffId:"person-1",shiftRuleId:"shift-1",
  branchId:null,workDate:"2026-10-09",status:"scheduled",version:3,
});
assert.throws(()=>runtime.mapCloudShiftRule({...row,start_time:"09:33:21"}),/Invalid cloud shift clock/);
assert.throws(()=>runtime.mapCloudRosterSlot({...slot,version:0}),/Invalid cloud roster revision/);
assert.throws(()=>runtime.ensureNoUnconfirmedRosterEvents([{aggregateType:"staff_shift_rules",status:"failed"}]),/Unconfirmed roster/);
assert.throws(()=>runtime.ensureNoUnconfirmedRosterEvents([{aggregateType:"staff_roster_slots",status:"pending"}]),/Unconfirmed roster/);
runtime.ensureNoUnconfirmedRosterEvents([{aggregateType:"staff_attendance",status:"pending"}]);
await assert.rejects(()=>runtime.loadCloudRoster({accessToken:null}),/Authenticated organization/);
const loaded=await runtime.loadCloudRoster({accessToken:"authorized"});
assert.equal(loaded.shiftRules.length,1);
assert.equal(loaded.rosterSlots[0].workDate,"2026-10-09");
failTable="staff_roster_slots";
await assert.rejects(()=>runtime.loadCloudRoster({accessToken:"authorized"}),/RLS denied/);
failTable="";

// Fail-closed cloud mapping: null coercion, forged hours, invalid calendar dates,
// missing foreign templates, duplicates, and branch mismatches must not hydrate.
for(const mutation of [
  {id:null}, {id:""}, {name:null}, {name:" "}, {name:"X".repeat(121)},
  {active:null}, {active:0}, {unpaid_break_minutes:null}, {unpaid_break_minutes:"30"},
  {unpaid_break_minutes:999}, {branch_id:""}, {start_time:"25:00:00"},
  {end_time:"09:22:07"}, {version:0},
]) {
  assert.throws(()=>runtime.mapCloudShiftRule({...row,...mutation}),/Invalid cloud|Shift |Unpaid break/);
}
for(const mutation of [
  {id:null}, {id:""}, {staff_id:null}, {staff_id:""}, {shift_rule_id:null},
  {shift_rule_id:""}, {branch_id:""}, {work_date:null}, {work_date:"2026-02-30"},
  {work_date:"2026-13-09"}, {work_date:"2026-10-09T00:00:00+05:30"},
  {work_date:"1800-01-01"}, {status:"approved"}, {version:0},
]) {
  assert.throws(()=>runtime.mapCloudRosterSlot({...slot,...mutation}),/Invalid cloud/);
}
shiftRows=[row,row];
await assert.rejects(()=>runtime.loadCloudRoster({accessToken:"authorized"}),/Duplicate cloud roster identities/);
shiftRows=[row]; rosterRows=[slot,slot];
await assert.rejects(()=>runtime.loadCloudRoster({accessToken:"authorized"}),/Duplicate cloud roster identities/);
rosterRows=[{...slot,shift_rule_id:"missing-shift"}];
await assert.rejects(()=>runtime.loadCloudRoster({accessToken:"authorized"}),/unavailable or mismatched/);
shiftRows=[{...row,branch_id:"one-branch"}];rosterRows=[{...slot,branch_id:"other-branch"}];
await assert.rejects(()=>runtime.loadCloudRoster({accessToken:"authorized"}),/unavailable or mismatched/);
shiftRows=[row];rosterRows=[slot];
assert.equal((await runtime.loadCloudRoster({accessToken:"authorized"})).rosterSlots.length,1);



assert.ok(source.includes("createRosterRemoteWriter(cfg)"),"Hydration must register the authenticated roster writer");
assert.match(code,/createSupabaseCloudAdapter/,"Workforce cloud writes reuse the existing atomic adapter");
assert.match(code,/Roster RPC did not acknowledge the original event ID/,"Missing acknowledgements are errors");
console.log("HR-004 authenticated Web roster read + atomic writer registration contract PASS");
