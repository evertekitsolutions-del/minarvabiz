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
