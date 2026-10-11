import { validateHolidayCache } from "./holiday-cache";
import { previewHolidayCalendar, previewRosterHolidayReview, previewAttendanceHolidayReview, type HolidayCalendarContext, type HolidayDayReview, type HolidayRule, type HolidayAttendanceRow, type HolidayAttendanceReview } from "./holiday-calendar";

/**
 * HR-005 conservative offline/Cloud *read-only* reconciliation.
 * Cloud input must come from the current tenant's authenticated, full RLS
 * read. A locally cached row is never a replay instruction or proof that a
 * remote row was deleted. No automatic overwrite, save, sync or pay changes.
 */
export type HolidayRevisionFinding =
  | "identical"
  | "cloud_newer_review"
  | "local_newer_unverified"
  | "same_version_divergence"
  | "local_only_unverified"
  | "cloud_only_unverified";

export interface HolidayRevisionReview {
  ruleId: string;
  kind: HolidayRevisionFinding;
  localVersion: number | null;
  cloudVersion: number | null;
}

const sameContent = (a: HolidayRule,b: HolidayRule): boolean =>
  a.id===b.id && a.orgId===b.orgId && a.scope===b.scope &&
  a.countryCode===b.countryCode && a.branchId===b.branchId &&
  a.date===b.date && a.repeatsAnnually===b.repeatsAnnually &&
  a.name===b.name && a.treatment===b.treatment && a.active===b.active;

const uuid = (s: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/**
 * Caller has already checked current session/permissions; this pure function
 * enforces pinned tenant and valid identity for *both* snapshots as a second
 * defense. A discrepancy is ALWAYS a human/server review item.
 */
export function reviewHolidayRevisionSnapshots(input: {
  orgId: string;
  local: readonly HolidayRule[];
  cloud: readonly HolidayRule[];
}): HolidayRevisionReview[] {
  if (!input || !uuid(input.orgId))
    throw new Error("Verified organization identity required for holiday revision review");

  // Reuse the exact existing backup validator; it copies and rejects
  // malformed/duplicate/mixed-organization entries before any comparison.
  const local=validateHolidayCache(input.local);
  const cloud=validateHolidayCache(input.cloud);
  for (const row of [...local,...cloud])
    if (row.orgId!==input.orgId)
      throw new Error("Holiday snapshot organization mismatch; no comparison is authorized");

  const byLocal=new Map(local.map(row=>[row.id,row]));
  const byCloud=new Map(cloud.map(row=>[row.id,row]));
  const ids=[...new Set([...byLocal.keys(),...byCloud.keys()])].sort();
  const findings:HolidayRevisionReview[]=[];
  for (const ruleId of ids) {
    const localRow=byLocal.get(ruleId),cloudRow=byCloud.get(ruleId);
    let kind:HolidayRevisionFinding;
    if (!localRow)kind="cloud_only_unverified";
    else if (!cloudRow)kind="local_only_unverified";
    else if (localRow.version<cloudRow.version)kind="cloud_newer_review";
    else if (localRow.version>cloudRow.version)kind="local_newer_unverified";
    else kind=sameContent(localRow,cloudRow)?"identical":"same_version_divergence";
    findings.push({ruleId,kind,localVersion:localRow?.version??null,
      cloudVersion:cloudRow?.version??null});
  }
  return findings;
}

/**
 * HR-005 read-only calendar impact preflight for a human reconciliation.
 * A revision mismatch is never an instruction to hydrate, erase or replay.
 * The caller must independently authenticate and authorize both sources.
 * This function only compares the effective branch-local calendar over a
 * bounded date range; it does not make pay/attendance/roster decisions.
 */
export interface HolidayCalendarImpact {
  date: string;
  localTreatment: HolidayDayReview["treatment"];
  cloudTreatment: HolidayDayReview["treatment"];
  localHolidayIds: string[];
  cloudHolidayIds: string[];
}

export function reviewHolidayCalendarImpact(input: {
  orgId: string;
  local: readonly HolidayRule[];
  cloud: readonly HolidayRule[];
  from: string;
  to: string;
  context: HolidayCalendarContext;
}): HolidayCalendarImpact[] {
  if (!input || !uuid(input.orgId) || !input.context ||
      input.context.orgId !== input.orgId)
    throw Error("Verified matching organization context required for holiday calendar impact review");

  const local = validateHolidayCache(input.local);
  const cloud = validateHolidayCache(input.cloud);
  for (const row of [...local, ...cloud])
    if (row.orgId !== input.orgId)
      throw Error("Holiday calendar impact refused across organizations");

  // The shared calendar engine enforces real local civil dates, a maximum
  // of 366 inclusive days and explicit branch/country scope on both sides.
  const params = {from: input.from, to: input.to, context: input.context};
  const localDays = previewHolidayCalendar({...params, rules: local});
  const cloudDays = previewHolidayCalendar({...params, rules: cloud});
  const impacts: HolidayCalendarImpact[] = [];
  for (let i = 0; i < localDays.length; i++) {
    const lhs = localDays[i], rhs = cloudDays[i];
    const localHolidayIds = lhs.holidays.map(row => row.id).sort();
    const cloudHolidayIds = rhs.holidays.map(row => row.id).sort();
    if (lhs.treatment !== rhs.treatment ||
        localHolidayIds.join(",") !== cloudHolidayIds.join(","))
      impacts.push({
        date: lhs.date, localTreatment: lhs.treatment,
        cloudTreatment: rhs.treatment, localHolidayIds, cloudHolidayIds
      });
  }
  return impacts;
}

/**
 * HR-005I — Human-only workforce impact of divergent holiday policies.
 * Uses caller-authorized roster/attendance reads and never approves Cloud
 * hydration, marks attendance, modifies a shift or infers pay/leave rights.
 * The pure review is not an authentication or server-receipt boundary.
 */
export interface HolidayStaffImpact {
  category: "roster" | "attendance";
  recordId: string;
  date: string;
  localReview: string | null;
  cloudReview: string | null;
  localHolidayIds: string[];
  cloudHolidayIds: string[];
}
export function reviewHolidayStaffImpact(input: {
  orgId: string;
  local: readonly HolidayRule[];
  cloud: readonly HolidayRule[];
  from: string;
  to: string;
  context: HolidayCalendarContext;
  slots: readonly {id:string;workDate:string;branchId:string|null;status:"scheduled"|"cancelled"}[];
  attendance: readonly HolidayAttendanceRow[];
}): HolidayStaffImpact[] {
  if(!input || !uuid(input.orgId) || !input.context ||
     input.context.orgId!==input.orgId)
    throw Error("Verified matching organization required for holiday staff impact review");
  const local=validateHolidayCache(input.local);
  const cloud=validateHolidayCache(input.cloud);
  for(const row of [...local,...cloud])
    if(row.orgId!==input.orgId)
      throw Error("Cross-organization holiday staff impact refused");
  // Check the entire time window even if no local staff record is present.
  // Never let a malformed/oversized scope quietly return an empty result.
  previewHolidayCalendar({rules:local,from:input.from,to:input.to,context:input.context});
  previewHolidayCalendar({rules:cloud,from:input.from,to:input.to,context:input.context});
  if(!Array.isArray(input.slots)||input.slots.length>5000 ||
     !Array.isArray(input.attendance)||input.attendance.length>5000)
    throw Error("Holiday staff impact needs bounded authorized staff rows");
  if(input.slots.some(row=>!row || row.workDate<input.from || row.workDate>input.to) ||
     input.attendance.some(row=>!row || row.date<input.from || row.date>input.to))
    throw Error("Holiday staff impact refuses outside-window records");
  const params={context:input.context};
  const localRoster=previewRosterHolidayReview({...params,rules:local,slots:input.slots});
  const cloudRoster=previewRosterHolidayReview({...params,rules:cloud,slots:input.slots});
  const period={...params,from:input.from,to:input.to,attendance:input.attendance};
  const localAttendance=previewAttendanceHolidayReview({...period,rules:local});
  const cloudAttendance=previewAttendanceHolidayReview({...period,rules:cloud});
  type Entry={id:string;date:string;reason:string;holidayIds:string[]};
  const combine=(category:HolidayStaffImpact["category"],lhs:Entry[],rhs:Entry[])=>{
    const left=new Map(lhs.map(x=>[x.id,x])),right=new Map(rhs.map(x=>[x.id,x]));
    const ids=[...new Set([...left.keys(),...right.keys()])].sort();
    const changes:HolidayStaffImpact[]=[];
    for(const recordId of ids){
      const a=left.get(recordId),b=right.get(recordId);
      const before=(a?.holidayIds??[]).slice().sort();
      const after=(b?.holidayIds??[]).slice().sort();
      if(a?.reason===b?.reason && before.join(",")===after.join(","))continue;
      changes.push({
        category,recordId,date:(a??b)!.date,localReview:a?.reason??null,
        cloudReview:b?.reason??null,localHolidayIds:before,cloudHolidayIds:after
      });
    }
    return changes;
  };
  const roster=(arr:typeof localRoster):Entry[]=>arr.map(x=>({
    id:x.slotId,date:x.date,reason:x.treatment,holidayIds:x.holidayIds
  }));
  const attendance=(arr:HolidayAttendanceReview[]):Entry[]=>arr.map(x=>({
    id:x.attendanceId,date:x.date,reason:x.reason,holidayIds:x.holidayIds
  }));
  return [
    ...combine("roster",roster(localRoster),roster(cloudRoster)),
    ...combine("attendance",attendance(localAttendance),attendance(cloudAttendance))
  ].sort((a,b)=>a.date.localeCompare(b.date)||a.category.localeCompare(b.category)||
    a.recordId.localeCompare(b.recordId));
}
