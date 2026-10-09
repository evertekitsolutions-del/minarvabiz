import type { PgClient } from "./supabase-adapter";

export function attendanceRemoteRow(id: string, payload: Record<string, unknown>): Record<string, unknown> {
  return {
    id, staff_id: payload.staffId, attendance_date: payload.date, status: payload.status,
    clock_in: payload.clockIn ?? null, clock_out: payload.clockOut ?? null,
    break_minutes: payload.breakMinutes ?? 0, overtime_minutes: payload.overtimeMinutes ?? 0,
    notes: payload.notes ?? null, branch_id: payload.branchId ?? null,
    version: payload.version ?? 1, created_at: payload.createdAt, updated_at: payload.updatedAt,
  };
}

export function attendanceRowsMatch(remote: Record<string, unknown>, row: Record<string, unknown>): boolean {
  return ["id", "staff_id", "attendance_date", "status", "break_minutes", "overtime_minutes", "notes", "branch_id", "version"].every(key => (remote[key] ?? null) === (row[key] ?? null)) &&
    ["clock_in", "clock_out"].every(key => remote[key] && row[key] ? Date.parse(String(remote[key])) === Date.parse(String(row[key])) : (remote[key] ?? null) === (row[key] ?? null));
}

/** Optimistic, retry-safe attendance mutation. Never acknowledge an empty/conflicting update. */
export async function writeAttendanceRow(client: PgClient, id: string, payload: Record<string, unknown>): Promise<void> {
  const row=attendanceRemoteRow(id,payload), version=Number(row.version);
  if(!Number.isInteger(version)||version<1) throw new Error("Attendance requires a positive version");
  const query=`select=*&id=eq.${encodeURIComponent(id)}&limit=1`;
  const read=async()=>{const r=await client.select("staff_attendance",query);if(r.error)throw new Error(r.error);return r.data?.[0];};
  let remote=await read();
  if(!remote){
    const inserted=await client.insert("staff_attendance",row);
    if(!inserted.error)return;
    remote=await read();
    if(!remote)throw new Error(inserted.error);
  }
  if(attendanceRowsMatch(remote,row))return;
  if(Number(remote.version)!==version-1 || version<2)throw new Error("Attendance version conflict; reload and review the remote entry before correcting it");
  const result=await client.update("staff_attendance",`id=eq.${encodeURIComponent(id)}&version=eq.${version-1}`,row);
  if(result.error)throw new Error(result.error);
  const committed=await read();
  if(!committed || !attendanceRowsMatch(committed,row))throw new Error("Attendance version conflict; update was not committed");
}
