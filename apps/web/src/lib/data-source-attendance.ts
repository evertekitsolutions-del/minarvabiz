import { configFromEnv, pgInsert, pgSelect, pgSelectAll, pgUpdate } from "@minarvabiz/database";
import { createSupabaseCloudAdapter, type RemoteWriter } from "@minarvabiz/business-logic";
import type { Branch, OutboxEvent } from "@minarvabiz/types";
import { mapAttendance } from "./data-source-mappers";
type Config=NonNullable<ReturnType<typeof configFromEnv>>;

export function createAttendanceRemoteWriter(cfg:Config):Pick<RemoteWriter,"getAttendance"|"upsertAttendance"> {
  return {
      getAttendance: async (id,staffId,date) => {
        const r=await pgSelect<Record<string,unknown>>(cfg,"staff_attendance",`select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
        if(r.error)throw new Error(r.error.message);
        if(r.data?.[0])return mapAttendance(r.data[0]);
        if(!staffId||!date)return null;
        const day=await pgSelect<Record<string,unknown>>(cfg,"staff_attendance",`select=*&staff_id=eq.${encodeURIComponent(staffId)}&attendance_date=eq.${encodeURIComponent(date)}&limit=1`);
        if(day.error)throw new Error(day.error.message);
        return day.data?.[0]?mapAttendance(day.data[0]):null;
      },
      upsertAttendance: async (_record,event) => {
        if(!event)throw new Error("Attendance requires its durable event identity");
        const adapter=createSupabaseCloudAdapter({
          select: async (table,query) => {const r=await pgSelect<Record<string,unknown>>(cfg,table,query);return {data:r.data,error:r.error?.message??null};},
          insert: async (table,row) => {const r=await pgInsert<Record<string,unknown>>(cfg,table,row);return {error:r.error?.message??null};},
          update: async (table,match,patch) => {const r=await pgUpdate<Record<string,unknown>>(cfg,table,match,patch);return {error:r.error?.message??null};},
        },event.deviceId);
        const result=await adapter.push([{...event,payload:event.payload as Record<string,unknown>} as OutboxEvent]);
        if(!result.accepted.includes(event.id))throw new Error(result.rejected[0]?.error||"Attendance write was not acknowledged");
      },
  };
}

export async function loadAttendanceStaff(cfg:Config){
  const [staff,attendance,branches]=await Promise.all([
    pgSelectAll<Record<string,unknown>>(cfg,"staff_members","select=*&order=name.asc,id.asc"),
    pgSelectAll<Record<string,unknown>>(cfg,"staff_attendance","select=*&order=attendance_date.desc,id.asc"),
    pgSelectAll<Record<string,unknown>>(cfg,"branches","select=*&deleted_at=is.null&order=name.asc,id.asc"),
  ]);
  for(const result of [staff,attendance,branches])if(result.error)throw new Error(result.error.message);
  return {staff:staff.data||[],attendance:(attendance.data||[]).map(mapAttendance),branches:(branches.data||[]).map(row=>({id:String(row.id),name:String(row.name),code:row.code as string|null,address:row.address as string|null,phone:row.phone as string|null,isHeadquarters:row.is_headquarters===true,isActive:row.is_active!==false,createdAt:String(row.created_at),updatedAt:String(row.updated_at)} as Branch))};
}
