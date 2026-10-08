import * as React from "react";
import {AttendanceGrid,type AttendanceDetails} from "@minarvabiz/ui";
import {phase6Store,can} from "@minarvabiz/business-logic";
import type {AttendanceStatus,StaffMember} from "@minarvabiz/types";
function todayLocal(){const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);}
export function DesktopAttendancePanel({staff,onChanged,onError}:{staff:StaffMember[];onChanged:()=>void|Promise<void>;onError:(message:string)=>void;}){
 const [month,setMonth]=React.useState(todayLocal().slice(0,7)),[busy,setBusy]=React.useState(false);
 if(!can("staff.manage"))return <p role="alert">You do not have permission to view or edit staff attendance.</p>;
 const rows=phase6Store.listAttendance({from:`${month}-01`,to:`${month}-31`});
 async function save(input:Parameters<typeof phase6Store.setAttendance>[0]){setBusy(true);try{phase6Store.setAttendance(input);await onChanged();}catch(e){onError(e instanceof Error?e.message:String(e));throw e;}finally{setBusy(false);}}
 async function markAll(status:AttendanceStatus){const active=staff.filter(m=>m.status==="active");if(!window.confirm(`Mark ${active.length} active staff as ${status.replace("_"," ")} today?`))return;setBusy(true);try{for(const member of active)phase6Store.setAttendance({staffId:member.id,date:todayLocal(),status});await onChanged();}catch(e){onError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 return <AttendanceGrid staff={staff} rows={rows} month={month} onMonthChange={setMonth} disabled={busy} onMark={(staffId,date,status)=>{void save({staffId,date,status}).catch(()=>undefined);}} onMarkAllToday={status=>void markAll(status)} onSaveDetails={(input:AttendanceDetails)=>save(input)}/>;
}
