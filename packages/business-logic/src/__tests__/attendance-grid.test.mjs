import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);

const permissions=require("../permissions.ts");
const phase6=require("../phase6-store.ts");
const schema=require("../../../database/src/schema/phase6.ts");

permissions.setCurrentRole("admin");
phase6.hydratePhase6({attendance:[]});

const created=phase6.setAttendance({staffId:"staff-1",date:"2026-10-08",status:"present",breakMinutes:30,overtimeMinutes:45,notes:"Opening shift"});
assert.equal(created.status,"present");
assert.equal(created.breakMinutes,30);
assert.equal(created.overtimeMinutes,45);
assert.equal(phase6.listAttendance({staffId:"staff-1",from:"2026-10-01",to:"2026-10-31"}).length,1);

const updated=phase6.setAttendance({staffId:"staff-1",date:"2026-10-08",status:"half_day",breakMinutes:15,overtimeMinutes:0});
assert.equal(updated.id,created.id);
assert.equal(updated.status,"half_day");
assert.equal(phase6.listAttendance().length,1,"same staff/date is an upsert");

phase6.setAttendance({staffId:"staff-2",date:"2026-10-08",status:"absent"});
const summary=phase6.attendanceSummary("2026-10-01","2026-10-31");
assert.equal(summary.get("staff-1").halfDay,1);
assert.equal(summary.get("staff-2").absent,1);
assert.throws(()=>phase6.setAttendance({staffId:"missing",date:"2026-10-08",status:"present"}),/Staff not found/);
assert.throws(()=>phase6.setAttendance({staffId:"staff-1",date:"08-10-2026",status:"present"}),/YYYY-MM-DD/);
assert.ok(schema.PHASE6_TABLES.includes("staff_attendance"));

const detailed=phase6.setAttendance({staffId:"staff-3",date:"2026-10-09",status:"present",clockIn:"2026-10-09T09:00:00Z",clockOut:"2026-10-09T18:00:00Z",breakMinutes:30,overtimeMinutes:60,notes:"Approved overtime"});
const statusOnly=phase6.setAttendance({staffId:"staff-3",date:"2026-10-09",status:"half_day"});
assert.equal(statusOnly.breakMinutes,30,"status changes must preserve recorded break time");
assert.equal(statusOnly.overtimeMinutes,60,"status changes must preserve recorded overtime");
assert.equal(statusOnly.notes,"Approved overtime");
assert.equal(statusOnly.clockIn,detailed.clockIn);
assert.equal(statusOnly.version,2,"each attendance correction increments its sync version");
const {exportOutbox,hydrateOutbox}=require("../outbox-bridge.ts");
const events=exportOutbox().filter(e=>e.aggregateId===detailed.id);
assert.equal(events[0].payload.status,"present","queued events must retain their original values after later edits");
assert.equal(events[0].payload.version,1);
assert.equal(events[1].payload.version,2);
for(const date of ["2026-02-30","2026-13-01","2025-02-29"]){
 assert.throws(()=>phase6.setAttendance({staffId:"staff-1",date,status:"present"}),/valid calendar date/);
}
phase6.setAttendance({staffId:"staff-1",date:"2024-02-29",status:"holiday"});
for(const patch of [{status:"invalid"},{breakMinutes:-1},{overtimeMinutes:1.5},{clockIn:"bad"},{clockIn:"2026-10-09T18:00:00Z",clockOut:"2026-10-09T09:00:00Z"}]){
 assert.throws(()=>phase6.setAttendance({staffId:"staff-1",date:"2026-10-10",status:"present",...patch}));
}
permissions.setCurrentRole("cashier");
assert.throws(()=>phase6.listAttendance(),/Permission denied/);
assert.throws(()=>phase6.setAttendance({staffId:"staff-1",date:"2026-10-08",status:"present"}),/Permission denied/);
permissions.setCurrentRole("admin");
const remote=require("../remote-write.ts");
hydrateOutbox([]);
phase6.setAttendance({staffId:"staff-1",date:"2026-10-11",status:"present"});
const original=exportOutbox().find(e=>e.aggregateType==="staff_attendance");
remote.registerRemoteWriter({applyAttendanceEvent:async ()=>{throw new Error("network unavailable");}});
await assert.rejects(()=>phase6.flushAttendanceOutbox(),/network unavailable/);
assert.equal(exportOutbox().find(e=>e.id===original.id).status,"pending","failed upload must remain retryable");
let received;
remote.registerRemoteWriter({applyAttendanceEvent:async e=>{received=e;}});
await phase6.flushAttendanceOutbox();
assert.equal(received.id,original.id,"retry must reuse the same event identity");
assert.equal(exportOutbox().find(e=>e.id===original.id).status,"synced");
remote.registerRemoteWriter(null);
hydrateOutbox([]);
const local=phase6.setAttendance({staffId:"staff-1",date:"2026-10-12",status:"present",overtimeMinutes:10});
const cloud={...local,id:"canonical-cloud-id",status:"absent",version:4,overtimeMinutes:0};
phase6.resolveAttendanceConflict(cloud,"local");
const correction=phase6.listAttendance({staffId:"staff-1",from:"2026-10-12",to:"2026-10-12"})[0];
assert.equal(correction.id,cloud.id);
assert.equal(correction.version,5);
assert.equal(correction.status,"present","explicit local resolution submits a new correction against the cloud version");
assert.equal(exportOutbox().filter(e=>e.aggregateType==="staff_attendance").length,1);
phase6.resolveAttendanceConflict({...cloud,version:6},"remote");
assert.equal(phase6.listAttendance({from:"2026-10-12",to:"2026-10-12"})[0].status,"absent");
assert.equal(exportOutbox().filter(e=>e.aggregateType==="staff_attendance").length,0);
console.log("Attendance Grid behavior PASS");
