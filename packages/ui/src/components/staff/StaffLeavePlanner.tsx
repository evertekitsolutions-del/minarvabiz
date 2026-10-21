"use client";

import * as React from "react";
import type {StaffMember} from "@minarvabiz/types";
import {buildStaffLeavePlan, phase9Store, type LeaveCategory, type StaffLeavePlan} from "@minarvabiz/business-logic";
import {Button} from "../Button";
import {inputClass,selectClass} from "../forms/FormField";

export function StaffLeavePlanner({staff}:{staff:readonly StaffMember[]}){
  const [staffId,setStaffId]=React.useState("");
  const [leaveType,setLeaveType]=React.useState<LeaveCategory>("annual");
  const [fromDate,setFromDate]=React.useState("");
  const [toDate,setToDate]=React.useState("");
  const [reason,setReason]=React.useState("");
  const [halfDay,setHalfDay]=React.useState(false);
  const [includeWeekends,setIncludeWeekends]=React.useState(false);
  const [preview,setPreview]=React.useState<StaffLeavePlan|null>(null);
  const [error,setError]=React.useState<string|null>(null);
  const branchId=phase9Store.getActiveBranch()?.id ?? null;
  const eligible=staff.filter(s=>!s.deletedAt && s.status==="active" &&
    (s.branchId==null || s.branchId===branchId));

  function invalidate(){setPreview(null);setError(null);}
  function calculate(){
    invalidate();
    try{
      setPreview(buildStaffLeavePlan({
        staffId,leaveType,fromDate,toDate,reason,
        isHalfDay:halfDay,includeWeekends,
      },staff,phase9Store.getActiveBranch()?.id ?? null));
    }catch(e){setError(e instanceof Error?e.message:"Cannot preview leave request");}
  }
  function downloadCsv(){
    if(!preview)return;
    setError(null);
    try{
      const url=URL.createObjectURL(new Blob(["\uFEFF",preview.csv],{type:"text/csv;charset=utf-8"}));
      const link=document.createElement("a");
      link.href=url;
      link.download="minarvabiz-leave-"+preview.fromDate+"-"+preview.toDate+".csv";
      document.body.appendChild(link);
      try{link.click();}finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
    }catch(e){setError(e instanceof Error?e.message:"CSV export failed");}
  }
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-base font-semibold text-slate-900">Staff leave request planner</summary>
      <p className="mt-2 text-xs text-slate-600">
        Preview leave days before submitting for management approval. Weekends can be excluded.
        No leave request is saved, no existing attendance is checked, no balances are debited,
        and no payroll, staff status or biometric attendance is changed.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-slate-600">
          Staff member
          <select aria-label="Leave staff member" className={selectClass+" mt-1"} value={staffId}
            onChange={e=>{setStaffId(e.target.value);invalidate();}}>
            <option value="">Select staff</option>
            {eligible.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Leave category
          <select aria-label="Leave category" className={selectClass+" mt-1"} value={leaveType}
            onChange={e=>{setLeaveType(e.target.value as LeaveCategory);invalidate();}}>
            <option value="annual">Annual leave</option><option value="sick">Sick leave</option>
            <option value="unpaid">Unpaid leave</option><option value="other">Other</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          From date
          <input type="date" aria-label="Leave from date" className={inputClass+" mt-1"}
            value={fromDate} onChange={e=>{setFromDate(e.target.value);invalidate();}} />
        </label>
        <label className="text-xs font-medium text-slate-600">
          To date
          <input type="date" aria-label="Leave to date" className={inputClass+" mt-1"}
            value={toDate} onChange={e=>{setToDate(e.target.value);invalidate();}} />
        </label>
        <label className="text-xs font-medium text-slate-600 sm:col-span-2 lg:col-span-4">
          Reason / handover notes
          <input aria-label="Leave reason" className={inputClass+" mt-1"} value={reason} maxLength={500}
            onChange={e=>{setReason(e.target.value);invalidate();}} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={halfDay} onChange={e=>{setHalfDay(e.target.checked);invalidate();}} />
          Half day (one-day requests only)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeWeekends} onChange={e=>{setIncludeWeekends(e.target.checked);invalidate();}} />
          Include Saturdays and Sundays
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={calculate}>Preview leave dates</Button>
        {preview&&<Button size="sm" variant="outline" onClick={downloadCsv}>Export leave CSV</Button>}
      </div>
      {error&&<p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
      {preview&&(
        <div className="mt-3 space-y-2">
          <p role="status" className="text-sm font-medium text-slate-800">
            {preview.staffName}: {preview.countedDays} leave day(s), {preview.excludedWeekendDays} weekend day(s) excluded
          </p>
          <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead><tr><th className="p-2">Date</th><th className="p-2">Day</th><th className="p-2">Units</th></tr></thead>
              <tbody>{preview.days.map(day=>(
                <tr key={day.date} className="border-t border-slate-100">
                  <td className="p-2">{day.date}</td><td className="p-2">{day.weekday}</td><td className="p-2">{day.units}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </details>
  );
}
