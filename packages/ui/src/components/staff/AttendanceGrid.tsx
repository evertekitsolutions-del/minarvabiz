"use client";
import * as React from "react";
import type {AttendanceStatus,StaffAttendanceRecord,StaffMember} from "@minarvabiz/types";
import {Button} from "../Button";
import {Modal} from "../forms/Modal";
import {inputClass,selectClass} from "../forms/FormField";

const statuses:Array<{value:AttendanceStatus;label:string}>=[{value:"present",label:"Present"},{value:"absent",label:"Absent"},{value:"half_day",label:"Half day"},{value:"leave",label:"Leave"},{value:"holiday",label:"Holiday"}];
export type AttendanceDetails={staffId:string;date:string;status:AttendanceStatus;clockIn:string|null;clockOut:string|null;breakMinutes:number;overtimeMinutes:number;notes:string|null};
function localTime(value?:string|null){if(!value)return "";const d=new Date(value);if(!Number.isFinite(d.getTime()))return "";return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}

export function AttendanceGrid({staff,rows,month,onMonthChange,onMark,onMarkAllToday,onSaveDetails,disabled=false}:{
 staff:StaffMember[];rows:StaffAttendanceRecord[];month:string;onMonthChange:(v:string)=>void;
 onMark:(staffId:string,date:string,status:AttendanceStatus)=>void;
 onMarkAllToday:(status:AttendanceStatus)=>void;
 onSaveDetails?:(input:AttendanceDetails)=>void|Promise<void>;disabled?:boolean;
}){
 const validMonth=/^\d{4}-(0[1-9]|1[0-2])$/.test(month);
 const days=React.useMemo(()=>{if(!validMonth)return [];const [y,m]=month.split("-").map(Number);return Array.from({length:new Date(Date.UTC(y,m,0)).getUTCDate()},(_,i)=>String(i+1).padStart(2,"0"));},[month,validMonth]);
 const visibleRows=React.useMemo(()=>rows.filter(r=>r.date.startsWith(`${month}-`)),[rows,month]);
 const byKey=React.useMemo(()=>new Map(visibleRows.map(r=>[`${r.staffId}|${r.date}`,r])),[visibleRows]);
 const [editor,setEditor]=React.useState<{staffId:string;name:string;date:string}|null>(null);
 const [draft,setDraft]=React.useState({status:"present" as AttendanceStatus,clockIn:"",clockOut:"",breakMinutes:"0",overtimeMinutes:"0",notes:""});
 const [saving,setSaving]=React.useState(false),[error,setError]=React.useState("");
 const sums=React.useMemo(()=>{const map=new Map<string,{p:number;a:number;h:number;l:number;holiday:number;ot:number}>();for(const r of visibleRows){const v=map.get(r.staffId)??{p:0,a:0,h:0,l:0,holiday:0,ot:0};if(r.status==="present")v.p++;else if(r.status==="absent")v.a++;else if(r.status==="half_day")v.h++;else if(r.status==="leave")v.l++;else if(r.status==="holiday")v.holiday++;v.ot+=r.overtimeMinutes;map.set(r.staffId,v);}return map;},[visibleRows]);
 function edit(member:StaffMember,date:string){const r=byKey.get(`${member.id}|${date}`);setEditor({staffId:member.id,name:member.name,date});setDraft({status:r?.status??"present",clockIn:localTime(r?.clockIn),clockOut:localTime(r?.clockOut),breakMinutes:String(r?.breakMinutes??0),overtimeMinutes:String(r?.overtimeMinutes??0),notes:r?.notes??""});setError("");}
 async function save(event:React.FormEvent){event.preventDefault();if(!editor||!onSaveDetails)return;setSaving(true);setError("");try{await onSaveDetails({staffId:editor.staffId,date:editor.date,status:draft.status,clockIn:draft.clockIn?new Date(draft.clockIn).toISOString():null,clockOut:draft.clockOut?new Date(draft.clockOut).toISOString():null,breakMinutes:Number(draft.breakMinutes),overtimeMinutes:Number(draft.overtimeMinutes),notes:draft.notes.trim()||null});setEditor(null);}catch(e){setError(e instanceof Error?e.message:"Unable to save attendance");}finally{setSaving(false);}}
 return <div className="space-y-4">
  <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">Attendance Grid</h1><p className="text-sm text-slate-500">Daily attendance, clock times, breaks and overtime.</p></div><div className="flex flex-wrap gap-2"><input aria-label="Attendance month" type="month" className={inputClass} value={month} onChange={e=>{if(e.target.value)onMonthChange(e.target.value);}}/><Button disabled={disabled} variant="outline" onClick={()=>onMarkAllToday("present")}>All present today</Button><Button disabled={disabled} variant="outline" onClick={()=>onMarkAllToday("holiday")}>Holiday today</Button></div></div>
  <div className="overflow-auto rounded-xl border bg-white"><table className="min-w-max text-sm"><thead><tr className="border-b bg-slate-50"><th className="sticky left-0 z-10 bg-slate-50 p-2 text-left">Staff</th>{days.map(d=><th key={d} className="p-2">{d}</th>)}<th>P</th><th>A</th><th>HD</th><th>L</th><th>H</th><th>OT</th></tr></thead><tbody>{staff.map(member=>{const t=sums.get(member.id);return <tr key={member.id} className="border-b"><th className="sticky left-0 bg-white p-2 text-left">{member.name}</th>{days.map(day=>{const date=`${month}-${day}`;const row=byKey.get(`${member.id}|${date}`);return <td key={day} className="p-1"><select disabled={disabled} aria-label={`${member.name} attendance ${date}`} className={selectClass+" min-w-24 py-1"} value={row?.status||""} onChange={e=>e.target.value&&onMark(member.id,date,e.target.value as AttendanceStatus)}><option value="">—</option>{statuses.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select>{onSaveDetails&&<button disabled={disabled} type="button" className="mt-1 block w-full rounded text-xs text-indigo-700 focus-visible:ring-2" aria-label={`Edit ${member.name} attendance ${date}`} onClick={()=>edit(member,date)}>Details</button>}</td>})}<td className="p-2">{t?.p||0}</td><td className="p-2">{t?.a||0}</td><td className="p-2">{t?.h||0}</td><td className="p-2">{t?.l||0}</td><td className="p-2">{t?.holiday||0}</td><td className="p-2">{t?.ot||0}m</td></tr>})}</tbody></table>{!staff.length&&<p className="p-6 text-center text-sm text-slate-500">Add staff to start attendance.</p>}</div>
  <Modal open={Boolean(editor)} title={`${editor?.name??"Attendance"} — ${editor?.date??""}`} onClose={()=>{if(!saving)setEditor(null);}}>
   <form onSubmit={event=>void save(event)} className="space-y-3">
    <label className="block">Status<select className={selectClass} value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as AttendanceStatus})}>{statuses.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
    <label className="block">Clock in (your local time)<input className={inputClass} type="datetime-local" value={draft.clockIn} onChange={e=>setDraft({...draft,clockIn:e.target.value})}/></label>
    <label className="block">Clock out (your local time)<input className={inputClass} type="datetime-local" value={draft.clockOut} onChange={e=>setDraft({...draft,clockOut:e.target.value})}/></label>
    <label className="block">Break minutes<input required min="0" step="1" className={inputClass} type="number" value={draft.breakMinutes} onChange={e=>setDraft({...draft,breakMinutes:e.target.value})}/></label>
    <label className="block">Overtime minutes<input required min="0" step="1" className={inputClass} type="number" value={draft.overtimeMinutes} onChange={e=>setDraft({...draft,overtimeMinutes:e.target.value})}/></label>
    <label className="block">Correction notes<textarea className={inputClass} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
    {error&&<p role="alert">{error}</p>}<Button type="submit" disabled={disabled||saving}>{saving?"Saving…":"Save attendance"}</Button>
   </form>
  </Modal>
 </div>;
}
