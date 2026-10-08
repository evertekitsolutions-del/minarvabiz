import * as React from "react";
import { AttendanceGrid } from "@minarvabiz/ui";
import { phase6Store } from "@minarvabiz/business-logic";
import type { AttendanceStatus, StaffMember } from "@minarvabiz/types";

function todayLocal(){const d=new Date();const off=d.getTimezoneOffset()*60000;return new Date(d.getTime()-off).toISOString().slice(0,10);}

export function DesktopAttendancePanel({staff,onChanged,onError}:{staff:StaffMember[];onChanged:()=>void|Promise<void>;onError:(message:string)=>void;}){
 const [month,setMonth]=React.useState(todayLocal().slice(0,7));
 const active=staff.filter(m=>m.status==="active");
 const rows=phase6Store.listAttendance({from:`${month}-01`,to:`${month}-31`});
 const mark=(staffId:string,date:string,status:AttendanceStatus)=>{try{phase6Store.setAttendance({staffId,date,status});void onChanged();}catch(e){onError(e instanceof Error?e.message:String(e));}};
 const markAll=(status:AttendanceStatus)=>{if(!window.confirm(`Mark all active staff as ${status.replace("_"," ")} today?`))return;try{for(const member of active)phase6Store.setAttendance({staffId:member.id,date:todayLocal(),status});void onChanged();}catch(e){onError(e instanceof Error?e.message:String(e));}};
 return <AttendanceGrid staff={active} rows={rows} month={month} onMonthChange={setMonth} onMark={mark} onMarkAllToday={markAll}/>;
}
