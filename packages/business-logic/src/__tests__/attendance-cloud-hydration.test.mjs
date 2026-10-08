import assert from "node:assert/strict";
import fs from "node:fs";
import Module,{createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const phase6=require("../phase6-store.ts"),permissions=require("../permissions.ts"),remote=require("../remote-write.ts");
permissions.setCurrentRole("admin");
const requested=[],calls=[];
const staff={id:"10000000-0000-0000-0000-000000000002",name:"Fixture employee",role:"staff",status:"active"};
const attendance={id:"10000000-0000-0000-0000-000000000001",staff_id:staff.id,attendance_date:"2026-10-08",status:"present",break_minutes:30,overtime_minutes:60,version:1,created_at:"2026-10-08T00:00:00Z",updated_at:"2026-10-08T00:00:00Z"};
const load=Module._load;
Module._load=function(name,...rest){
 if(name==="@minarvabiz/database")return {
  isSupabaseConfigured:()=>true,configFromEnv:()=>({}),verifySupabaseConnection:async()=>({ok:true}),createDatabase:async()=>({}),
  pgSelectAll:async (cfg,table)=>{assert.equal(cfg.accessToken,"fixture-session");requested.push(table);return {data:table==="staff_members"?[staff]:table==="staff_attendance"?[attendance]:[],error:null};},
  pgRpc:async (cfg,name,args)=>{assert.equal(cfg.accessToken,"fixture-session");calls.push({name,args});return {data:{accepted:true},error:null};},
 };
 if(name==="@minarvabiz/business-logic")return {phase6Store:phase6,registerRemoteWriter:remote.registerRemoteWriter};
 return load.call(this,name,...rest);
};
const source=require("../../../../apps/web/src/lib/data-source.ts");
Module._load=load;
assert.ok(source.supabaseHydrationDomainsForPath("/attendance").includes("staff"));
const [result]=await Promise.all([source.hydrateStoresFromSupabase("fixture-session",["staff","attendance"]),source.hydrateStoresFromSupabase("fixture-session",["staff","attendance"])]);
assert.equal(result.ok,true,result.message);
assert.ok(requested.includes("staff_attendance"),"cloud attendance must be fetched on staff-domain hydration");
assert.equal(requested.filter(t=>t==="staff_attendance").length,1,"layout/page hydration must not race or overwrite newer local edits");
assert.equal(phase6.listAttendance()[0].overtimeMinutes,60);
assert.equal(phase6.listAttendance()[0].date,"2026-10-08");
phase6.setAttendance({staffId:staff.id,date:"2026-10-08",status:"half_day"});
await phase6.flushAttendanceOutbox();
assert.equal(calls[0].name,"apply_staff_attendance_event");
assert.equal(calls[0].args.p_record.version,2);
assert.equal(calls[0].args.p_record.overtimeMinutes,60);
assert.equal(calls[0].args.p_record.status,"half_day");
console.log("Attendance online hydration/write PASS");
