"use client";
import * as React from "react";
import { AttendanceGrid, Button } from "@minarvabiz/ui";
import { can, exportOutbox, getRuntimeMode, phase6Store, phase9Store } from "@minarvabiz/business-logic";
import type { AttendanceStatus } from "@minarvabiz/types";
import { isStaffHydrated } from "@/lib/data-source";

function localDate(){const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);}
export default function AttendancePage(){
 const [month,setMonth]=React.useState(localDate().slice(0,7)),[,refresh]=React.useReducer(v=>v+1,0);
 const [ready,setReady]=React.useState(false),[message,setMessage]=React.useState("");
 React.useEffect(()=>{setReady(getRuntimeMode()==="demo"||isStaffHydrated());const loaded=(event:Event)=>{const result=(event as CustomEvent).detail;if(result?.ok){setReady(isStaffHydrated());refresh();}else setMessage(result?.message||"Attendance could not load");};window.addEventListener("minarva:data-hydrated",loaded);return()=>window.removeEventListener("minarva:data-hydrated",loaded);},[]);
 React.useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(exportOutbox().some(e=>e.aggregateType==="staff_attendance"&&e.status!=="synced")){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[]);
 const changed=()=>{setMessage("");refresh();};
 async function mark(staffId:string,date:string,status:AttendanceStatus){try{await phase6Store.saveAttendance({staffId,date,status});changed();}finally{refresh();}}
 async function markAll(status:AttendanceStatus,staffIds:string[]){const today=localDate();if(!confirm(`Mark ${staffIds.length} active staff as ${status.replace("_"," ")} for ${today}?`))return;try{for(const staffId of staffIds)await phase6Store.saveAttendance({staffId,date:today,status});changed();}finally{refresh();}}
 const pending=exportOutbox().filter(e=>e.aggregateType==="staff_attendance"&&e.status!=="synced"&&phase6Store.getStaff((e.payload as {staffId:string}).staffId));
 return <div className="space-y-3">{pending.length>0&&<p role="status">{pending.length} attendance changes pending cloud confirmation. Keep this window open until confirmed. <Button variant="outline" disabled={!can("staff.manage")} onClick={()=>void(async()=>{try{for(const id of new Set(pending.map(e=>e.aggregateId)))await phase6Store.retryAttendance(id);setMessage("");}catch(e){setMessage(e instanceof Error?e.message:"Retry failed");}finally{refresh();}})()}>Retry pending attendance</Button></p>}{!ready&&<p role="status">Loading staff attendance…</p>}{message&&<p role="alert">{message}</p>}<AttendanceGrid staff={[...phase6Store.listStaff(),...phase6Store.listArchivedStaff()]} rows={phase6Store.listAttendance({from:`${month}-01`,to:`${month}-31`})} month={month} onMonthChange={setMonth} onMark={mark} onMarkAllToday={markAll} canEdit={ready&&can("staff.manage")} branches={phase9Store.listBranches()} onSaveDetails={async(staffId,date,details)=>{try{await phase6Store.saveAttendance({staffId,date,...details});changed();}finally{refresh();}}}/></div>;
}
