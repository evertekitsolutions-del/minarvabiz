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

console.log("Attendance Grid behavior PASS");

phase6.hydratePhase6({attendance:[]});
const detail=phase6.setAttendance({staffId:"staff-1",date:"2026-10-09",status:"present",clockIn:"2026-10-09T09:00:00Z",clockOut:"2026-10-09T18:00:00Z",breakMinutes:30,overtimeMinutes:45,notes:"Keep this"});
const outbox=require("../outbox-bridge.ts");
const firstEvent=outbox.exportOutbox().find(e=>e.aggregateId===detail.id);
phase6.setAttendance({staffId:"staff-1",date:"2026-10-09",status:"half_day"});
assert.equal(detail.breakMinutes,30,"changing only status preserves break metadata");
assert.equal(detail.overtimeMinutes,45);
assert.equal(detail.notes,"Keep this");
assert.equal(detail.clockIn,"2026-10-09T09:00:00Z");
assert.equal(detail.version,2);
assert.equal(firstEvent.payload.status,"present","outbox payload is a historical snapshot");
for(const input of [
 {date:"2026-02-30"},{date:"2026-13-01"},{status:"unknown"},{breakMinutes:-1},{overtimeMinutes:1.5},
 {clockIn:"invalid"},{clockIn:"2026-10-09T18:00:00Z",clockOut:"2026-10-09T09:00:00Z"}
]) assert.throws(()=>phase6.setAttendance({staffId:"staff-1",date:"2026-10-09",status:"present",...input}));
assert.equal(detail.version,2,"invalid changes leave state untouched");
permissions.setCurrentRole("cashier");
assert.throws(()=>phase6.setAttendance({staffId:"staff-1",date:"2026-10-09",status:"present"}),/Permission|permission/);
permissions.setCurrentRole("admin");
phase6.setAttendance({staffId:"staff-1",date:"2026-10-09",status:"present",notes:null,clockIn:null,clockOut:null});
assert.equal(detail.notes,null);
assert.equal(detail.clockIn,null);
console.log("Attendance validation and immutable history PASS");
const remote=require('../remote-write.ts');
const sent=[];
remote.registerRemoteWriter({upsertAttendance:async r=>{sent.push(structuredClone(r));}});
const online=await phase6.saveAttendance({staffId:'staff-2',date:'2026-10-10',status:'present'});
assert.equal(sent[0].id,online.id);
assert.ok(outbox.exportOutbox().filter(e=>e.aggregateId===online.id).every(e=>e.status==='synced'));
remote.registerRemoteWriter({upsertAttendance:async()=>{throw new Error('remote conflict');}});
await assert.rejects(()=>phase6.saveAttendance({staffId:'staff-2',date:'2026-10-10',status:'absent'}),/remote conflict/);
assert.ok(outbox.exportOutbox().some(e=>e.aggregateId===online.id&&e.status==='failed'));
remote.registerRemoteWriter(null);
console.log('Attendance awaited writes and retained failures PASS');
// Rehydration must retain a failed correction and its next revision number.
const older={...online,status:'present',version:1};
phase6.hydrateAttendanceFromCloud([older]);
assert.equal(phase6.listAttendance({staffId:'staff-2'}).find(r=>r.date==='2026-10-10').status,'absent');
assert.equal(phase6.listAttendance({staffId:'staff-2'}).find(r=>r.date==='2026-10-10').version,2);
await phase6.saveAttendance({staffId:'staff-2',date:'2026-10-10',status:'half_day'});
assert.equal(phase6.listAttendance({staffId:'staff-2'}).find(r=>r.date==='2026-10-10').version,3);
console.log('Attendance pending hydration reconciliation PASS');
const remoteEntry={...phase6.listAttendance({staffId:'staff-2'}).find(r=>r.date==='2026-10-10'),status:'holiday',version:3};
remote.registerRemoteWriter({getAttendance:async()=>structuredClone(remoteEntry),upsertAttendance:async r=>{remoteEntry.status=r.status;remoteEntry.version=r.version;}});
const review=await phase6.reviewAttendanceConflict(remoteEntry.id);
assert.equal(review.remote.status,'holiday');assert.equal(review.local.status,'half_day');
await assert.rejects(()=>phase6.resolveAttendanceConflict(remoteEntry.id,'local',2,3),/changed/);
await phase6.resolveAttendanceConflict(remoteEntry.id,'local',3,3);
assert.equal(remoteEntry.status,'half_day');assert.equal(remoteEntry.version,4);
assert.ok(outbox.exportOutbox().some(e=>e.aggregateId===remoteEntry.id&&e.status==='discarded'));
remoteEntry.status='holiday';remoteEntry.version=5;
await phase6.resolveAttendanceConflict(remoteEntry.id,'remote',5,4);
assert.equal(phase6.listAttendance({staffId:'staff-2'}).find(r=>r.date==='2026-10-10').status,'holiday');
remote.registerRemoteWriter(null);
console.log('Attendance explicit conflict review/rebase PASS');

phase6.setAttendance({staffId:'staff-2',date:'2026-10-10',status:'absent'});
let completeRead;remote.registerRemoteWriter({getAttendance:()=>new Promise(r=>{completeRead=r;})});
const resolution=phase6.resolveAttendanceConflict(remoteEntry.id,'remote',5,6);
phase6.setAttendance({staffId:'staff-2',date:'2026-10-10',status:'half_day',notes:'Newer correction must survive'});
completeRead({...remoteEntry});
await assert.rejects(()=>resolution,/changed/);
assert.equal(phase6.listAttendance({staffId:'staff-2'}).find(r=>r.id===remoteEntry.id).notes,'Newer correction must survive');
assert.equal(outbox.exportOutbox().filter(e=>e.aggregateId===remoteEntry.id&&e.status==='pending').length,2);
remote.registerRemoteWriter(null);
console.log('Attendance conflict review concurrent edit protection PASS');

const collisionLocal=phase6.setAttendance({staffId:'staff-2',date:'2026-10-11',status:'present'});
const collisionRemote={...collisionLocal,id:'other-device-attendance',status:'holiday',version:1};
phase6.hydrateAttendanceFromCloud([collisionRemote]);
assert.equal(phase6.listAttendance({staffId:'staff-2'}).filter(r=>r.date==='2026-10-11').length,1,'pending collision must not double-count cloud day');
remote.registerRemoteWriter({getAttendance:async(id,staffId,date)=>{assert.equal(staffId,'staff-2');assert.equal(date,'2026-10-11');return collisionRemote;},upsertAttendance:async r=>{assert.equal(r.id,collisionRemote.id);assert.equal(r.version,2);}});
await phase6.resolveAttendanceConflict(collisionLocal.id,'local',1,1);
assert.equal(phase6.listAttendance({staffId:'staff-2'}).filter(r=>r.date==='2026-10-11').length,1);
assert.equal(phase6.listAttendance({staffId:'staff-2'}).find(r=>r.date==='2026-10-11').id,collisionRemote.id);
remote.registerRemoteWriter(null);
console.log('Attendance different-device natural key conflict resolution PASS');
