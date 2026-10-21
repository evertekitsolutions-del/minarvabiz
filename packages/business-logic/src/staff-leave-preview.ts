/**
 * HR-006 — read-only staff leave request worksheet / calendar preview.
 *
 * Original Minarva Biz TypeScript based on general HR leave workflows.
 * No ERPNext/Odoo/Dolibarr source or automatic payroll/attendance posting.
 */
import type { StaffMember } from "@minarvabiz/types";

export type LeaveCategory = "annual" | "sick" | "unpaid" | "other";
export interface StaffLeavePlanInput {
  readonly staffId: string;
  readonly leaveType: LeaveCategory;
  readonly fromDate: string;
  readonly toDate: string;
  readonly isHalfDay: boolean;
  readonly includeWeekends: boolean;
  readonly reason: string;
}
export interface StaffLeaveDay {
  readonly date: string;
  readonly units: number;
  readonly weekday: string;
}
export interface StaffLeavePlan {
  readonly staffId: string;
  readonly staffName: string;
  readonly leaveType: LeaveCategory;
  readonly fromDate: string;
  readonly toDate: string;
  readonly countedDays: number;
  readonly excludedWeekendDays: number;
  readonly days: readonly StaffLeaveDay[];
  readonly csv: string;
}
function parseCivilDate(s:string):number{
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(s))throw new Error("Leave date must be YYYY-MM-DD");
  const [y,m,d]=s.split("-").map(Number);
  const value=Date.UTC(y,m-1,d);
  const dt=new Date(value);
  if(dt.getUTCFullYear()!==y || dt.getUTCMonth()+1!==m || dt.getUTCDate()!==d){
    throw new Error("Invalid leave calendar date");
  }
  return value;
}
function csvCell(raw:string|number):string{
  const value=String(raw);
  const safe=/^[\s\uFEFF]*[=+\-@\t\r]/u.test(value)?"'"+value:value;
  return '"'+safe.replace(/"/g,'""')+'"';
}

/** Personnel authorization must come from host; no mutation or leave approval. */
export function buildStaffLeavePlan(
  request:StaffLeavePlanInput,
  staff:readonly StaffMember[],
  branchId:string|null,
):StaffLeavePlan{
  const employee=staff.find(s=>s.id===request.staffId);
  if(!employee || employee.deletedAt || employee.status!=="active" ||
    (employee.branchId!=null && employee.branchId!==branchId)){
    throw new Error("Staff member is inactive or outside the active branch");
  }
  if(!["annual","sick","unpaid","other"].includes(request.leaveType)){
    throw new Error("Unsupported leave category");
  }
  if(typeof request.reason!=="string"||request.reason.length>500){
    throw new Error("Leave reason must be at most 500 characters");
  }
  if(!employee.name.trim()||employee.name.length>256)throw new Error("Staff name is invalid");
  const from=parseCivilDate(request.fromDate),to=parseCivilDate(request.toDate);
  const durationDays=Math.round((to-from)/86_400_000)+1;
  if(durationDays<1||durationDays>180)throw new Error("Leave interval must span 1 to 180 calendar days");
  if(request.isHalfDay && durationDays!==1)throw new Error("Half-day leave must be a single calendar day");
  if(typeof request.includeWeekends!=="boolean"||typeof request.isHalfDay!=="boolean"){
    throw new Error("Invalid leave day options");
  }
  const weekdays=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] as const;
  const days:StaffLeaveDay[]=[];
  let excludedWeekendDays=0;
  for(let i=0;i<durationDays;i++){
    const date=new Date(from+i*86_400_000);
    const weekdayIndex=date.getUTCDay();
    if(!request.includeWeekends && (weekdayIndex===0||weekdayIndex===6)){
      excludedWeekendDays++;
      continue;
    }
    days.push({
      date:date.toISOString().slice(0,10),
      weekday:weekdays[weekdayIndex],
      units:request.isHalfDay?0.5:1,
    });
  }
  if(!days.length)throw new Error("Leave interval contains no counted working days");
  const total=days.reduce((sum,day)=>sum+day.units,0);
  const rows=[
    ["Employee ID","Employee","Leave type","Date","Weekday","Leave day units","Reason"],
    ...days.map(day=>[
      employee.id,employee.name,request.leaveType,day.date,day.weekday,
      day.units.toFixed(1),request.reason.trim(),
    ]),
  ];
  return {
    staffId:employee.id,staffName:employee.name,leaveType:request.leaveType,
    fromDate:request.fromDate,toDate:request.toDate,
    countedDays:total,excludedWeekendDays,days,
    csv:rows.map(row=>row.map(csvCell).join(",")).join("\r\n")+"\r\n",
  };
}
