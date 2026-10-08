import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {createSupabaseCloudAdapter}=require("../supabase-adapter.ts");
const {createConflict,autoResolve}=require("../conflict.ts");
const row={id:"10000000-0000-0000-0000-000000000001",staffId:"10000000-0000-0000-0000-000000000002",date:"2026-10-08",status:"present",breakMinutes:30,overtimeMinutes:60,version:1,createdAt:"2026-10-08T00:00:00Z",updatedAt:"2026-10-08T00:00:00Z"};
const event={id:"10000000-0000-0000-0000-000000000003",aggregateType:"staff_attendance",aggregateId:row.id,eventType:"insert",payload:row,deviceId:"device-local",sequence:1,occurredAt:row.updatedAt};
let args, mode="ok";
const client={
 insert:async()=>{throw new Error("attendance must use the atomic RPC");},
 update:async()=>{throw new Error("attendance must use the atomic RPC");},
 select:async table=>({data:table==="staff_attendance"?[{id:row.id,staff_id:row.staffId,attendance_date:row.date,status:"present",break_minutes:30,overtime_minutes:60,version:2,created_at:row.createdAt,updated_at:row.updatedAt}]:[],error:null}),
 rpc:async (name,input)=>{assert.equal(name,"apply_staff_attendance_event");args=input;if(mode==="error")return {data:null,error:"network failed"};if(mode==="conflict")return {data:{accepted:false,remote:{...row,version:2}},error:null};return {data:{accepted:true},error:null};},
};
const adapter=createSupabaseCloudAdapter(client,"device-local");
let result=await adapter.push([event]);
assert.deepEqual(result.accepted,[event.id]);
assert.equal(args.p_record.staffId,row.staffId);
assert.equal(args.p_event_id,event.id);
assert.equal(args.p_sequence,1);
assert.deepEqual(event.payload,row,"transport must not mutate queued event payload");
const pulled=await adapter.pull("1970-01-01T00:00:00Z","device-local");
const remote=pulled.records.find(r=>r.tableName==="staff_attendance").record;
assert.equal(remote.staffId,row.staffId);
assert.equal(remote.date,row.date);
assert.equal(remote.overtimeMinutes,60);
mode="error";result=await adapter.push([event]);assert.deepEqual(result.accepted,[]);assert.match(result.rejected[0].error,/network failed/);
mode="conflict";result=await adapter.push([event]);assert.equal(result.rejected[0].remote.version,2);
assert.equal(autoResolve(createConflict({tableName:"staff_attendance",recordId:row.id,local:row,remote:{...row,version:2}})).winner,null,"HR conflicts require explicit review rather than last-write-wins");
const noRpc=createSupabaseCloudAdapter({...client,rpc:undefined},"device-local");
result=await noRpc.push([event]);assert.match(result.rejected[0].error,/RPC/);
console.log("Attendance transport PASS: atomic write, immutable retry identity, cloud pull and conflict propagation");
