"use client";

import * as React from "react";
import { Button, inputClass, selectClass } from "@minarvabiz/ui";
import { phase6Store } from "@minarvabiz/business-logic";
import type { AttendanceStatus, StaffAttendanceRecord, StaffMember } from "@minarvabiz/types";

function localDate(d=new Date()){const off=d.getTimezoneOffset()*60000;return new Date(d.getTime()-off).toISOString().slice(0,10);}
function monthBounds(value:string){return {from:`${value}-01`,to:`${value}-31`};}
const statuses: Array<{value:AttendanceStatus;label:string}>=[
  {value:"present",label:"Present"},{value:"absent",label:"Absent"},{value:"half_day",label:"Half day"},
  {value:"leave",label:"Leave"},{value:"holiday",label:"Holiday"},
];

export default function AttendancePage(){
  const today=localDate();
  const [month,setMonth]=React.useState(today.slice(0,7));
  const [staff,setStaff]=React.useState<StaffMember[]>([]);
  const [rows,setRows]=React.useState<StaffAttendanceRecord[]>([]);
  const [message,setMessage]=React.useState("");
  const refresh=React.useCallback(()=>{const b=monthBounds(month);setStaff(phase6Store.listStaff({status:"active"}));setRows(phase6Store.listAttendance(b));},[month]);
  React.useEffect(()=>refresh(),[refresh]);
  const days=React.useMemo(()=>{const [y,m]=month.split("-").map(Number);return Array.from({length:new Date(y,m,0).getDate()},(_,i)=>String(i+1).padStart(2,"0"));},[month]);
  const byKey=React.useMemo(()=>new Map(rows.map(r=>[`${r.staffId}|${r.date}`,r])),[rows]);
  const summary=React.useMemo(()=>{const b=monthBounds(month);return phase6Store.attendanceSummary(b.from,b.to);},[rows,month]);

  function mark(member:StaffMember,date:string,status:AttendanceStatus){
    try{phase6Store.setAttendance({staffId:member.id,date,status});setMessage("");refresh();}
    catch(e){setMessage(e instanceof Error?e.message:"Unable to update attendance");}
  }
  function markAllToday(status:AttendanceStatus){
    if(!confirm(`Mark all active staff as ${status.replace("_"," ")} for ${today}?`))return;
    try{for(const member of staff)phase6Store.setAttendance({staffId:member.id,date:today,status});setMessage("");refresh();}
    catch(e){setMessage(e instanceof Error?e.message:"Unable to update attendance");}
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Attendance Grid</h1><p className="text-sm text-slate-500">Offline-first daily attendance. Changes are audited and queued for hybrid sync.</p></div>
      <div className="flex flex-wrap gap-2">
        <input aria-label="Attendance month" type="month" className={inputClass} value={month} onChange={e=>setMonth(e.target.value)}/>
        <Button variant="outline" onClick={()=>markAllToday("present")}>All present today</Button>
        <Button variant="outline" onClick={()=>markAllToday("holiday")}>Holiday today</Button>
      </div>
    </div>
    {message&&<p role="alert" className="rounded-lg border p-3 text-sm">{message}</p>}
    <div className="overflow-auto rounded-xl border bg-white">
      <table className="min-w-max text-sm">
        <thead><tr className="border-b bg-slate-50"><th className="sticky left-0 z-10 bg-slate-50 p-2 text-left">Staff</th>{days.map(day=><th key={day} className="p-2 text-center">{day}</th>)}<th className="p-2">P</th><th className="p-2">A</th><th className="p-2">HD</th><th className="p-2">L</th><th className="p-2">OT</th></tr></thead>
        <tbody>{staff.map(member=>{const total=summary.get(member.id);return <tr key={member.id} className="border-b last:border-0">
          <th className="sticky left-0 z-10 bg-white p-2 text-left font-medium">{member.name}<div className="text-xs font-normal text-slate-500">{member.role}</div></th>
          {days.map(day=>{const date=`${month}-${day}`;const row=byKey.get(`${member.id}|${date}`);return <td key={day} className="p-1"><select aria-label={`${member.name} attendance ${date}`} className={selectClass+" min-w-24 py-1"} value={row?.status||""} onChange={e=>e.target.value&&mark(member,date,e.target.value as AttendanceStatus)}><option value="">—</option>{statuses.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></td>})}
          <td className="p-2 text-center">{total?.present||0}</td><td className="p-2 text-center">{total?.absent||0}</td><td className="p-2 text-center">{total?.halfDay||0}</td><td className="p-2 text-center">{total?.leave||0}</td><td className="p-2 text-center">{total?.overtimeMinutes||0}m</td>
        </tr>})}</tbody>
      </table>
      {!staff.length&&<p className="p-6 text-center text-sm text-slate-500">Add active staff to start attendance.</p>}
    </div>
  </div>;
}
