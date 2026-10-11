/**
 * HR-005 holiday calendar — shared, deterministic, read-only rules engine.
 *
 * Date values are branch-local civil days, NEVER inferred UTC instants.
 * Rules must come from authorized tenant-scoped storage; this module is not
 * an authentication/SQL enforcement boundary. No statutory holidays, pay,
 * shift cancellation, attendance status or overtime can be inferred here.
 */
export type HolidayScope = "country" | "organization" | "branch";
export type HolidayTreatment = "non_working" | "informational";
export interface HolidayRule {
  id: string;
  orgId: string;
  scope: HolidayScope;
  countryCode: string | null;
  branchId: string | null;
  date: string; // YYYY-MM-DD of configured rule, not a UTC timestamp
  repeatsAnnually: boolean;
  name: string;
  treatment: HolidayTreatment;
  active: boolean;
  version: number;
}
export interface HolidayCalendarContext {
  orgId: string;
  branchId: string | null;
  countryCode: string | null;
}
export interface HolidayDayReview {
  date: string;
  treatment: HolidayTreatment | "none" | "needs_review";
  holidays: HolidayRule[];
}
const realDate = (date: string): boolean => {
  if(typeof date!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y,m,d]=date.split("-").map(Number);
  if(y<1900 || y>9999) return false;
  const value=new Date(0);
  value.setUTCFullYear(y,m-1,d);
  value.setUTCHours(0,0,0,0);
  return value.getUTCFullYear()===y && value.getUTCMonth()===m-1 &&
    value.getUTCDate()===d;
};
const nonEmpty=(v:unknown):v is string=>typeof v==="string"&&v.trim().length>0&&v===v.trim();
export function validateHolidayRule(rule:HolidayRule):void {
  if(!rule || !nonEmpty(rule.id) || !nonEmpty(rule.orgId) ||
     !nonEmpty(rule.name) || rule.name.length>120 ||
     !realDate(rule.date) || typeof rule.repeatsAnnually!=="boolean" ||
     typeof rule.active!=="boolean" ||
     !Number.isSafeInteger(rule.version) || rule.version<1 ||
     !["non_working","informational"].includes(rule.treatment) ||
     !["country","organization","branch"].includes(rule.scope))
    throw Error("Holiday rule identity, name, date, state, version or treatment invalid");
  if(rule.scope==="country"){
    if(!rule.countryCode || !/^[A-Z]{2}$/.test(rule.countryCode) || rule.branchId!==null)
      throw Error("Country holiday needs explicit ISO alpha-2 country, never a branch");
  }else if(rule.scope==="branch"){
    if(!nonEmpty(rule.branchId) || rule.countryCode!==null)
      throw Error("Branch holiday needs a branch and no country code");
  }else if(rule.branchId!==null || rule.countryCode!==null){
    throw Error("Organization holiday must not carry a country or branch");
  }
}
function assertContext(context:HolidayCalendarContext){
  if(!context || !nonEmpty(context.orgId) ||
     (context.branchId!==null && !nonEmpty(context.branchId)) ||
     (context.countryCode!==null && !/^[A-Z]{2}$/.test(context.countryCode)))
    throw Error("Verified holiday organization, branch and country scope required");
}
function matches(rule:HolidayRule,day:string,context:HolidayCalendarContext):boolean {
  if(rule.orgId!==context.orgId || !rule.active) return false;
  if(rule.scope==="branch" && rule.branchId!==context.branchId) return false;
  if(rule.scope==="country" && rule.countryCode!==context.countryCode) return false;
  return rule.repeatsAnnually ? rule.date.slice(5)===day.slice(5) : rule.date===day;
}
/**
 * Country, organization and branch holidays are all visible; conflicting
 * treatments are deliberately NOT resolved by undocumented precedence.
 */
export function reviewHolidayDay(
  rules:readonly HolidayRule[],date:string,context:HolidayCalendarContext,
):HolidayDayReview {
  assertContext(context);
  if(!realDate(date) || !Array.isArray(rules) || rules.length>5000)
    throw Error("Holiday review needs a real calendar day and bounded rules");
  const ids=new Set<string>(), applicable:HolidayRule[]=[];
  for(const rule of rules){
    validateHolidayRule(rule);
    if(ids.has(rule.id)) throw Error("Duplicate holiday rule ID; resolve before calendar review");
    ids.add(rule.id);
    if(matches(rule,date,context)) applicable.push({...rule});
  }
  applicable.sort((a,b)=>a.scope.localeCompare(b.scope)||
    a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
  const types=new Set(applicable.map(x=>x.treatment));
  const treatment:HolidayDayReview["treatment"]=types.size>1?"needs_review":
    types.size===0?"none":applicable[0].treatment;
  return {date,treatment,holidays:applicable};
}
/** Read-only, at most 366 inclusive days; never autofill HR/payroll status. */
export function previewHolidayCalendar(input:{
  rules:readonly HolidayRule[];from:string;to:string;
  context:HolidayCalendarContext;
}):HolidayDayReview[] {
  const {rules,from,to,context}=input;
  assertContext(context);
  if(!realDate(from)||!realDate(to)||from>to)throw Error("Holiday preview needs ordered real local dates");
  const start=Date.parse(from+"T00:00:00Z"),end=Date.parse(to+"T00:00:00Z");
  if((end-start)/86400000>=366)throw Error("Holiday preview is limited to 366 days");
  // Validate all entries once, including hidden/other-scope records, before
  // computing any partial result; never mask a corrupted tenant snapshot.
  const ids=new Set<string>();
  if(!Array.isArray(rules)||rules.length>5000)throw Error("Invalid holiday rules");
  for(const rule of rules){
    validateHolidayRule(rule);
    if(ids.has(rule.id))throw Error("Duplicate holiday rule ID");
    ids.add(rule.id);
  }
  const result:HolidayDayReview[]=[];
  for(let t=start;t<=end;t+=86400000){
    const day=new Date(t).toISOString().slice(0,10);
    const applicable=rules.filter(rule=>matches(rule,day,context)).map(rule=>({...rule}))
      .sort((a,b)=>a.scope.localeCompare(b.scope)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
    const treatments=new Set(applicable.map(rule=>rule.treatment));
    result.push({date:day,holidays:applicable,
      treatment:treatments.size>1?"needs_review":treatments.size===0?"none":applicable[0].treatment});
  }
  return result;
}
/**
 * Existing roster entries remain unchanged; this finds holiday exceptions
 * requiring a manager decision. Roster guarding and pay require separate
 * authorized server and local Offline/Hybrid parity milestones.
 */
export function previewRosterHolidayReview(input:{
  rules:readonly HolidayRule[];
  context:HolidayCalendarContext;
  slots:readonly {id:string;workDate:string;branchId:string|null;status:"scheduled"|"cancelled"}[];
}):Array<{slotId:string;date:string;treatment:"non_working"|"needs_review";holidayIds:string[]}> {
  const seen=new Set<string>();
  const result:Array<{slotId:string;date:string;treatment:"non_working"|"needs_review";holidayIds:string[]}>=[];
  for(const slot of input.slots){
    if(!nonEmpty(slot.id)||seen.has(slot.id)||!realDate(slot.workDate)||
       !["scheduled","cancelled"].includes(slot.status))
      throw Error("Roster holiday preview cannot accept invalid/duplicate assignment");
    seen.add(slot.id);
    if(slot.status==="cancelled"||slot.branchId!==input.context.branchId)continue;
    const review=reviewHolidayDay(input.rules,slot.workDate,input.context);
    if(review.treatment==="non_working"||review.treatment==="needs_review")
      result.push({slotId:slot.id,date:slot.workDate,treatment:review.treatment,
        holidayIds:review.holidays.map(h=>h.id)});
  }
  return result.sort((a,b)=>a.date.localeCompare(b.date)||a.slotId.localeCompare(b.slotId));
}


/**
 * Read-only reconciliation of existing attendance statuses with CONFIGURED
 * holiday rules. A finding is a question for an authorized manager, never
 * proof of a statutory entitlement, a payroll error, or authority to edit.
 * Country and branch scope are explicit; unknown branch is quarantined.
 */
export type AttendanceHolidayStatus="present"|"absent"|"half_day"|"leave"|"holiday";
export interface HolidayAttendanceRow {
  id:string;
  staffId:string;
  date:string;
  branchId?:string|null;
  status:AttendanceHolidayStatus;
}
export type HolidayAttendanceReviewReason=
  "contradictory_rules"|"nonworking_day_requires_review"|
  "unmatched_holiday_status"|"branch_scope_unverified";
export interface HolidayAttendanceReview {
  attendanceId:string;
  staffId:string;
  date:string;
  status:AttendanceHolidayStatus;
  reason:HolidayAttendanceReviewReason;
  holidayIds:string[];
}
/** Review up to one civil year; work only on caller-authorized attendance. */
export function previewAttendanceHolidayReview(input:{
  rules:readonly HolidayRule[];
  context:HolidayCalendarContext;
  from:string;
  to:string;
  attendance:readonly HolidayAttendanceRow[];
}):HolidayAttendanceReview[] {
  const days=previewHolidayCalendar({
    rules:input.rules,context:input.context,from:input.from,to:input.to,
  });
  if(!Array.isArray(input.attendance)||input.attendance.length>5000)
    throw Error("Attendance holiday review requires bounded authorized records");
  const byDay=new Map(days.map(day=>[day.date,day]));
  const seen=new Set<string>(),findings:HolidayAttendanceReview[]=[];
  for(const record of input.attendance){
    if(!record||!nonEmpty(record.id)||!nonEmpty(record.staffId)||
       !realDate(record.date)||
       !["present","absent","half_day","leave","holiday"].includes(record.status)||
       (record.branchId!==undefined&&record.branchId!==null&&!nonEmpty(record.branchId)))
      throw Error("Attendance holiday review contains malformed identity/date/status/branch");
    const key=record.staffId+":"+record.date;
    if(seen.has(key))throw Error("Duplicate staff/date attendance requires canonical review");
    seen.add(key);
    const day=byDay.get(record.date);
    if(!day)continue;
    const recordBranch=record.branchId??null;
    if(recordBranch!==null&&recordBranch!==input.context.branchId)continue;
    let reason:HolidayAttendanceReviewReason|null=null;
    if(recordBranch===null&&input.context.branchId!==null)
      reason="branch_scope_unverified";
    else if(day.treatment==="needs_review")
      reason="contradictory_rules";
    else if(day.treatment==="non_working"&&record.status!=="holiday")
      reason="nonworking_day_requires_review";
    else if(day.treatment!=="non_working"&&record.status==="holiday")
      reason="unmatched_holiday_status";
    if(reason)findings.push({
      attendanceId:record.id,staffId:record.staffId,date:record.date,
      status:record.status,reason,holidayIds:day.holidays.map(x=>x.id),
    });
  }
  return findings.sort((a,b)=>a.date.localeCompare(b.date)||
    a.staffId.localeCompare(b.staffId)||a.attendanceId.localeCompare(b.attendanceId));
}
