/** Pure HR-004 CSV serializer: exports only already authorized visible roster rows. */
import type { RosterSlot, ShiftRule } from "./workforce-roster";
interface CsvInput {
  slots: readonly RosterSlot[];
  staff: readonly {id:string;name:string}[];
  shifts: readonly ShiftRule[];
  branches: readonly {id:string;name:string}[];
}
/** Quote every cell, suppress spreadsheet formula execution and flatten controls. */
function cell(value: unknown): string {
  let text=String(value ?? "").replace(/[\u0000-\u001f\u007f]/g," ");
  if (/^\s*[=+\-@]/u.test(text)) text="'" + text;
  return '"' + text.replace(/"/g,'""') + '"';
}
export function buildRosterCsv({slots,staff,shifts,branches}:CsvInput):string {
  const people=new Map(staff.map(s=>[s.id,s.name]));
  const templates=new Map(shifts.map(s=>[s.id,s]));
  const locations=new Map(branches.map(b=>[b.id,b.name]));
  const header=["Work date","Employee","Employee ID","Shift","Start","End",
    "Unpaid break (minutes)","Branch","Status","Revision"];
  const rows=[...slots].sort((a,b)=>a.workDate.localeCompare(b.workDate) ||
    a.staffId.localeCompare(b.staffId) || a.id.localeCompare(b.id)).map(slot=>{
    const shift=templates.get(slot.shiftRuleId);
    return [slot.workDate,people.get(slot.staffId) ?? "Archived employee ("+slot.staffId+")",
      slot.staffId,shift?.name ?? "Archived shift ("+slot.shiftRuleId+")",
      shift?.startTime ?? "",shift?.endTime ?? "",shift?.unpaidBreakMinutes ?? "",
      slot.branchId===null ? "Organization-wide" : locations.get(slot.branchId) ?? "Archived branch ("+slot.branchId+")",
      slot.status,slot.version];
  });
  return [header,...rows].map(row=>row.map(cell).join(",")).join("\r\n")+"\r\n";
}
