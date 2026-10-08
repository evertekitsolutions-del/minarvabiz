import * as React from "react";
import { AttendanceGrid } from "@minarvabiz/ui";
import { can, phase6Store, phase9Store } from "@minarvabiz/business-logic";
import type { AttendanceStatus, StaffMember } from "@minarvabiz/types";
function todayLocal(){const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);}
export function DesktopAttendancePanel({staff,onChanged,onError}:{staff:StaffMember[];onChanged:()=>void|Promise<void>;onError:(message:string)=>void;}){
 const [month,setMonth]=React.useState(todayLocal().slice(0,7));
 if(!can("staff.manage"))return <p role="alert">You do not have access to staff attendance.</p>;
 const rows=phase6Store.listAttendance();
 async function update(input:Parameters<typeof phase6Store.setAttendance>[0]){try{phase6Store.setAttendance(input);await onChanged();}catch(e){onError(e instanceof Error?e.message:String(e));throw e;}}
 const markAll=async(status:AttendanceStatus,staffIds:string[])=>{if(!window.confirm(`Mark ${staffIds.length} active staff as ${status.replace("_"," ")} today?`))return;try{for(const staffId of staffIds)phase6Store.setAttendance({staffId,date:todayLocal(),status});}finally{await onChanged();}};
 return <AttendanceGrid staff={[...staff,...phase6Store.listArchivedStaff()]} rows={rows} month={month} onMonthChange={setMonth} onMark={(staffId,date,status)=>update({staffId,date,status})} onMarkAllToday={markAll} canEdit={can("staff.manage")} branches={phase9Store.listBranches()} onSaveDetails={(staffId,date,details)=>update({staffId,date,...details})}/>;
}
