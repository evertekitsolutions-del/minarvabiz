"use client";
import * as React from "react";
import {AttendanceGrid,Button,type AttendanceDetails} from "@minarvabiz/ui";
import {phase6Store,can,getSessionToken} from "@minarvabiz/business-logic";
import {isSupabaseConfigured} from "@minarvabiz/database";
import {hydrateStoresFromSupabase} from "@/lib/data-source";
import type {AttendanceStatus,StaffAttendanceRecord,StaffMember} from "@minarvabiz/types";
function todayLocal(){const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);}

export default function AttendancePage(){
 const [month,setMonth]=React.useState(todayLocal().slice(0,7));
 const [staff,setStaff]=React.useState<StaffMember[]>([]),[rows,setRows]=React.useState<StaffAttendanceRecord[]>([]);
 const [ready,setReady]=React.useState(false),[busy,setBusy]=React.useState(false),[message,setMessage]=React.useState("");
 const [conflict,setConflict]=React.useState<StaffAttendanceRecord|null>(null);
 const refresh=React.useCallback(()=>{if(!can("staff.manage"))return;setStaff(phase6Store.listStaff());setRows(phase6Store.listAttendance({from:`${month}-01`,to:`${month}-31`}));},[month]);
 const load=React.useCallback(async()=>{setMessage("");try{if(isSupabaseConfigured()){const result=await hydrateStoresFromSupabase(getSessionToken(),["staff","attendance"]);if(!result.ok)throw new Error(result.message);}refresh();setReady(true);}catch(e){setReady(false);setMessage(e instanceof Error?e.message:"Attendance could not be loaded");}},[refresh]);
 React.useEffect(()=>{void load();},[load]);
 function showError(e:unknown){if(e instanceof phase6Store.AttendanceConflictError)setConflict(e.remote);setMessage(e instanceof Error?e.message:"Attendance could not be saved");}
 async function save(input:Parameters<typeof phase6Store.setAttendance>[0]){setBusy(true);try{phase6Store.setAttendance(input);refresh();await phase6Store.flushAttendanceOutbox();setMessage(isSupabaseConfigured()?"Attendance saved.":"Attendance saved on this device.");}catch(e){showError(e);throw e;}finally{setBusy(false);}}
 async function retry(){setBusy(true);try{await phase6Store.flushAttendanceOutbox();setMessage("Pending attendance changes saved.");}catch(e){showError(e);}finally{setBusy(false);}}
 async function markAll(status:AttendanceStatus){const active=staff.filter(s=>s.status==="active");if(!confirm(`Mark ${active.length} active staff as ${status.replace("_"," ")} for ${todayLocal()}?`))return;setBusy(true);try{for(const member of active)phase6Store.setAttendance({staffId:member.id,date:todayLocal(),status});refresh();await phase6Store.flushAttendanceOutbox();setMessage("Attendance saved.");}catch(e){showError(e);}finally{setBusy(false);}}
 async function resolve(choice:"local"|"remote"){if(!conflict||!confirm(choice==="local"?"Submit your attendance as a new correction to the cloud record?":"Keep the cloud record and discard pending corrections for this staff/day?"))return;setBusy(true);try{phase6Store.resolveAttendanceConflict(conflict,choice);setConflict(null);refresh();await phase6Store.flushAttendanceOutbox();setMessage("Attendance conflict resolved.");}catch(e){showError(e);}finally{setBusy(false);}}
 if(!can("staff.manage"))return <p role="alert">You do not have permission to view or edit staff attendance.</p>;
 return <div className="space-y-4">
  {message&&<p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}
  {!ready&&<Button onClick={()=>void load()} disabled={busy}>Reload attendance</Button>}
  {ready&&<Button variant="outline" onClick={()=>void retry()} disabled={busy}>Retry pending changes</Button>}
  {conflict&&<div role="alert" className="space-y-2 rounded-lg border p-3"><p>Cloud attendance for {conflict.date}: {conflict.status.replace("_"," ")}, overtime {conflict.overtimeMinutes} minutes. Another device changed this staff/day.</p><Button disabled={busy} onClick={()=>void resolve("remote")}>Keep cloud record</Button><Button disabled={busy} variant="outline" onClick={()=>void resolve("local")}>Submit my correction</Button></div>}
  <AttendanceGrid staff={staff} rows={rows} month={month} onMonthChange={setMonth} disabled={!ready||busy||Boolean(conflict)} onMark={(staffId,date,status)=>{void save({staffId,date,status}).catch(()=>undefined);}} onMarkAllToday={status=>void markAll(status)} onSaveDetails={(input:AttendanceDetails)=>save(input)}/>
 </div>;
}
