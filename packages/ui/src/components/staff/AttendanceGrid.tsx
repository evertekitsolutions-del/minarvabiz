"use client";
import * as React from "react";
import type { AttendanceStatus, StaffAttendanceRecord, StaffMember } from "@minarvabiz/types";
import { Button } from "../Button";
import { Modal } from "../forms/Modal";
import { FormField, inputClass, selectClass } from "../forms/FormField";

const statuses: Array<{value:AttendanceStatus;label:string}>=[{value:"present",label:"Present"},{value:"absent",label:"Absent"},{value:"half_day",label:"Half day"},{value:"leave",label:"Leave"},{value:"holiday",label:"Holiday"}];
export type AttendanceDetails=Pick<StaffAttendanceRecord,"status"|"clockIn"|"clockOut"|"breakMinutes"|"overtimeMinutes"|"notes">;
function localInput(value?:string|null){if(!value)return "";const d=new Date(value);if(!Number.isFinite(d.getTime()))return "";return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}

export function AttendanceGrid({staff,rows,month,onMonthChange,onMark,onMarkAllToday,onSaveDetails,canEdit=true,branches=[]}: {
 staff:StaffMember[];rows:StaffAttendanceRecord[];month:string;onMonthChange:(v:string)=>void;
 onMark:(staffId:string,date:string,status:AttendanceStatus)=>void|Promise<void>;
 onMarkAllToday:(status:AttendanceStatus,staffIds:string[])=>void|Promise<void>;
 onSaveDetails?:(staffId:string,date:string,details:AttendanceDetails)=>void|Promise<void>;
 canEdit?:boolean;branches?:Array<{id:string;name:string}>;
}) {
 const [branch,setBranch]=React.useState("");
 const [editing,setEditing]=React.useState<{staffId:string;date:string;name:string}|null>(null);
 const [form,setForm]=React.useState({status:"present" as AttendanceStatus,clockIn:"",clockOut:"",breakMinutes:"0",overtimeMinutes:"0",notes:""});
 const [busy,setBusy]=React.useState(false),[error,setError]=React.useState("");
 const days=React.useMemo(()=>{if(!/^\d{4}-\d{2}$/.test(month))return [];const [y,m]=month.split("-").map(Number);return Array.from({length:new Date(y,m,0).getDate()},(_,i)=>String(i+1).padStart(2,"0"));},[month]);
 const monthRows=rows.filter(r=>r.date.startsWith(`${month}-`));
 const visible=staff.filter(m=>((m.status!=="inactive"&&!m.deletedAt)||monthRows.some(r=>r.staffId===m.id))&&(!branch||(branch==="unassigned"?!m.branchId:m.branchId===branch)||monthRows.some(r=>r.staffId===m.id&&(branch==="unassigned"?!r.branchId:r.branchId===branch))));
 const filteredRows=monthRows.filter(r=>!branch||(branch==="unassigned"?!r.branchId:r.branchId===branch));
 const allByKey=new Map(monthRows.map(r=>[`${r.staffId}|${r.date}`,r]));
 const byKey=new Map(filteredRows.map(r=>[`${r.staffId}|${r.date}`,r]));
 const summaries=new Map<string,{p:number;a:number;h:number;l:number;holiday:number;ot:number;work:number}>();
 for(const r of filteredRows){const v=summaries.get(r.staffId)??{p:0,a:0,h:0,l:0,holiday:0,ot:0,work:0};if(r.status==="present")v.p++;else if(r.status==="absent")v.a++;else if(r.status==="half_day")v.h++;else if(r.status==="leave")v.l++;else if(r.status==="holiday")v.holiday++;v.ot+=r.overtimeMinutes;if(r.clockIn&&r.clockOut)v.work+=Math.max(0,(Date.parse(r.clockOut)-Date.parse(r.clockIn))/60000-r.breakMinutes);summaries.set(r.staffId,v);}
 async function act(fn:()=>void|Promise<void>){setBusy(true);setError("");try{await fn();return true;}catch(e){setError(e instanceof Error?e.message:"Unable to save attendance");return false;}finally{setBusy(false);}}
 function openDetails(member:StaffMember,date:string){const row=byKey.get(`${member.id}|${date}`);setForm({status:row?.status??"present",clockIn:localInput(row?.clockIn),clockOut:localInput(row?.clockOut),breakMinutes:String(row?.breakMinutes??0),overtimeMinutes:String(row?.overtimeMinutes??0),notes:row?.notes??""});setEditing({staffId:member.id,date,name:member.name});setError("");}
 async function save(){if(!editing||!onSaveDetails)return;const saved=await act(()=>onSaveDetails(editing.staffId,editing.date,{status:form.status,clockIn:form.clockIn?new Date(form.clockIn).toISOString():null,clockOut:form.clockOut?new Date(form.clockOut).toISOString():null,breakMinutes:Number(form.breakMinutes),overtimeMinutes:Number(form.overtimeMinutes),notes:form.notes||null}));if(saved)setEditing(null);}
 const activeIds=visible.filter(m=>m.status==="active"&&!m.deletedAt&&(!branch||(branch==="unassigned"?!m.branchId:m.branchId===branch))).map(m=>m.id);
 return <div className="space-y-4">
  <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">Attendance Grid</h1><p className="text-sm text-slate-500">Daily attendance, clock-in/out, breaks and overtime. Changes are audited.</p></div><div className="flex flex-wrap gap-2">
   <input aria-label="Attendance month" type="month" className={inputClass} value={month} onChange={e=>/^\d{4}-\d{2}$/.test(e.target.value)&&onMonthChange(e.target.value)}/>
   <select aria-label="Attendance branch" className={selectClass} value={branch} onChange={e=>setBranch(e.target.value)}><option value="">All branches</option><option value="unassigned">Unassigned</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
   <Button variant="outline" disabled={!canEdit||busy||!activeIds.length} onClick={()=>void act(()=>onMarkAllToday("present",activeIds))}>All present today</Button>
   <Button variant="outline" disabled={!canEdit||busy||!activeIds.length} onClick={()=>void act(()=>onMarkAllToday("holiday",activeIds))}>Holiday today</Button>
  </div></div>
  {error&&<p role="alert" className="rounded-lg border border-rose-300 p-3 text-sm">{error}</p>}
  {!canEdit&&<p className="text-sm text-slate-500">Attendance is read-only for your current access.</p>}
  <div className="overflow-auto rounded-xl border bg-white"><table className="min-w-max text-sm"><caption className="sr-only">Attendance for {month}</caption><thead><tr className="border-b bg-slate-50"><th scope="col" className="sticky left-0 z-10 bg-slate-50 p-2 text-left">Staff</th>{days.map(d=><th scope="col" key={d} className="p-2">{d}</th>)}{["P","A","HD","L","Holiday","OT","Worked"].map(h=><th scope="col" key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{visible.map(member=>{const t=summaries.get(member.id);return <tr key={member.id} className="border-b"><th scope="row" className="sticky left-0 bg-white p-2 text-left">{member.name}{member.status!=="active"&&<div className="text-xs font-normal">{member.status}</div>}</th>{days.map(day=>{const date=`${month}-${day}`,row=byKey.get(`${member.id}|${date}`),otherBranch=Boolean(branch&&allByKey.has(`${member.id}|${date}`)&&!row);return <td key={day} className="p-1"><select disabled={!canEdit||busy||Boolean(member.deletedAt)||otherBranch} aria-label={`${member.name} attendance ${date}`} className={selectClass+" min-w-24 py-1"} value={row?.status||""} onChange={e=>{const status=e.target.value as AttendanceStatus;if(status)void act(()=>onMark(member.id,date,status));}}><option value="">{otherBranch?"Other branch":"—"}</option>{statuses.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select>{onSaveDetails&&<button type="button" disabled={!canEdit||busy||Boolean(member.deletedAt)||otherBranch} className="block w-full rounded px-1 py-1 text-xs text-indigo-700 focus:outline-none focus:ring-2" aria-label={`${member.name} details ${date}`} onClick={()=>openDetails(member,date)}>Details</button>}</td>})}{[t?.p,t?.a,t?.h,t?.l,t?.holiday].map((v,i)=><td key={i} className="p-2">{v||0}</td>)}<td className="p-2">{t?.ot||0}m</td><td className="p-2">{Math.round(t?.work||0)}m</td></tr>})}</tbody></table>{!visible.length&&<p className="p-6 text-center text-sm text-slate-500">No staff attendance for this selection.</p>}</div>
  <Modal open={Boolean(editing)} title={`Attendance details — ${editing?.name??""} ${editing?.date??""}`} onClose={()=>!busy&&setEditing(null)} footer={<Button disabled={busy} onClick={()=>void save()}>{busy?"Saving…":"Save attendance"}</Button>}>
   <div className="space-y-3"><FormField label="Status"><select className={selectClass} value={form.status} onChange={e=>setForm({...form,status:e.target.value as AttendanceStatus})}>{statuses.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></FormField>
    <FormField label="Clock-in (your device timezone)"><input className={inputClass} type="datetime-local" value={form.clockIn} onChange={e=>setForm({...form,clockIn:e.target.value})}/></FormField>
    <FormField label="Clock-out (your device timezone)"><input className={inputClass} type="datetime-local" value={form.clockOut} onChange={e=>setForm({...form,clockOut:e.target.value})}/></FormField>
    <FormField label="Break minutes"><input className={inputClass} type="number" min="0" step="1" value={form.breakMinutes} onChange={e=>setForm({...form,breakMinutes:e.target.value})}/></FormField>
    <FormField label="Overtime minutes"><input className={inputClass} type="number" min="0" step="1" value={form.overtimeMinutes} onChange={e=>setForm({...form,overtimeMinutes:e.target.value})}/></FormField>
    <FormField label="Notes / correction reason"><textarea className={inputClass+" h-20 py-2"} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></FormField>
    {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
   </div>
  </Modal>
 </div>;
}
