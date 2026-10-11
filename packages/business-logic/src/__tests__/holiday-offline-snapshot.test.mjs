import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(
 fs.readFileSync(file,"utf8"),{fileName:file,compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true
 }}).outputText,file);
const permissions=require("../permissions.ts");
const cache=require("../holiday-cache.ts");
const persistence=require("../persistence.ts");
const rule={id:"a5000000-0000-4000-8000-000000000001",
 orgId:"10000000-0000-4000-8000-000000000001",
 scope:"branch",countryCode:null,
 branchId:"c1000000-0000-4000-8000-000000000001",
 date:"2024-02-29",repeatsAnnually:true,name:"Leap-day rule",
 treatment:"non_working",active:true,version:2};
permissions.setCurrentRole("admin");
cache.hydrateHolidayCache([rule]);
assert.deepEqual(cache.listHolidayCache(),[rule]);
const copies=cache.exportHolidayCache();
copies[0].name="Attempted external mutation";
assert.equal(cache.exportHolidayCache()[0].name,"Leap-day rule");
const snap=persistence.exportDomainSnapshotFull();
assert.equal(snap.version,15,"Holiday snapshot needs a new explicit version");
assert.deepEqual(snap.holidayRules,[rule]);
cache.hydrateHolidayCache([]);
assert.equal(cache.listHolidayCache().length,0);
assert.equal(persistence.importDomainSnapshot(snap).ok,true);
assert.deepEqual(cache.exportHolidayCache(),[rule],"Windows SQLite snapshot must round trip holidays");
assert.equal(persistence.validateDomainSnapshot(snap).ok,true);
const corrupt=structuredClone(snap);
corrupt.holidayRules=[rule,{...rule,id:"a5000000-0000-4000-8000-000000000002",
 orgId:"20000000-0000-4000-8000-000000000002"}];
let result=persistence.importDomainSnapshot(corrupt);
assert.equal(result.ok,false,"Cross-tenant snapshot must not import");
assert.deepEqual(cache.exportHolidayCache(),[rule],
 "Rejected backup cannot overwrite last trusted holiday cache");
const duplicate=structuredClone(snap);
duplicate.holidayRules=[rule,rule];
assert.equal(persistence.validateDomainSnapshot(duplicate).ok,false,
 "Duplicate rule UUID must refuse import");
const invalidDate=structuredClone(snap);
invalidDate.holidayRules[0].date="2026-02-30";
assert.equal(persistence.importDomainSnapshot(invalidDate).ok,false);
assert.deepEqual(cache.exportHolidayCache(),[rule]);
const legacy=structuredClone(snap);
legacy.version=14;delete legacy.holidayRules;
assert.equal(persistence.importDomainSnapshot(legacy).ok,true,
 "Pre-HR005 v14 Windows backups must remain importable");
assert.equal(cache.exportHolidayCache().length,0,
 "Old organization snapshots must clear previously loaded holiday data");
assert.ok(persistence.SNAPSHOT_VERSION===15);
const after=persistence.exportDomainSnapshotFull();
assert.deepEqual(after.holidayRules,[]);
permissions.setCurrentRole("cashier");
assert.throws(()=>cache.listHolidayCache(),/permission/i,
 "Cashier must not gain direct HR holiday cache read access");
assert.doesNotMatch(fs.readFileSync("packages/business-logic/src/holiday-cache.ts","utf8"),
 /saveAttendance\(|assignRosterSlot\(|apply_staff_holiday_event|pgRpc\(/,
 "Offline backup parity cannot silently enable HR writes or Cloud replay");
console.log("HR005 native SQLite v15 holiday snapshot roundtrip, v14 compatibility, tenant validation, rollback and RBAC PASS");
