/**
 * SVC-012 — explicit technician-site arrival and visit-completion deadlines.
 * These are manually agreed calendar-time targets, not a contractual SLA engine
 * or an automated response-time guarantee. No background timer or paid API.
 */
export interface ServiceVisitSlaTargets {
  readonly arrivalDueAt: string | null;
  readonly completionDueAt: string | null;
}
export type VisitSlaStageStatus =
  "untracked" | "on_track" | "due_soon" | "overdue" | "met" | "missed" | "cancelled";
export interface ServiceVisitSlaStage {
  readonly dueAt: string | null;
  readonly occurredAt: string | null;
  readonly status: VisitSlaStageStatus;
  /** Negative when early; positive when late, available only for an occurred event. */
  readonly minutesFromDeadline: number | null;
}
export interface ServiceVisitSlaRow {
  readonly visitId: string;
  readonly orderId: string;
  readonly scheduledOn: string;
  readonly siteStatus: string;
  readonly arrival: ServiceVisitSlaStage;
  readonly completion: ServiceVisitSlaStage;
}
export interface ServiceVisitSlaReport {
  readonly trackedVisits: number;
  readonly overdueVisits: number;
  readonly dueSoonVisits: number;
  readonly missedVisits: number;
  readonly cancelledVisits: number;
  readonly rows: ServiceVisitSlaRow[];
}
export interface ServiceVisitSlaSource {
  readonly id: string; readonly orderId: string; readonly scheduledOn: string;
  readonly status: "scheduled" | "arrived" | "completed" | "cancelled";
  readonly arrivedAt: string | null; readonly completedAt: string | null;
  readonly sla?: ServiceVisitSlaTargets;
}
function dateTime(value: unknown, label: string): string {
  if(typeof value!=="string"||!/^20\d{2}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||
      !Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)
    throw new Error("Invalid "+label+" — provide a UTC ISO timestamp");
  return value;
}
export function validateServiceVisitSla(input: unknown, createdAt: string): ServiceVisitSlaTargets {
  dateTime(createdAt,"site visit creation timestamp");
  if(!input||typeof input!=="object"||Array.isArray(input))
    throw new Error("Invalid site visit SLA deadlines");
  const v=input as Record<string,unknown>;
  if(Object.keys(v).some(k=>k!=="arrivalDueAt"&&k!=="completionDueAt")||
    !Object.hasOwn(v,"arrivalDueAt")||!Object.hasOwn(v,"completionDueAt"))
    throw new Error("Invalid site visit SLA fields");
  const arrivalDueAt=v.arrivalDueAt===null?null:dateTime(v.arrivalDueAt,"arrival deadline");
  const completionDueAt=v.completionDueAt===null?null:dateTime(v.completionDueAt,"completion deadline");
  if(arrivalDueAt===null&&completionDueAt===null)
    throw new Error("At least one SLA deadline is required");
  if(arrivalDueAt!==null&&arrivalDueAt<createdAt||
     completionDueAt!==null&&completionDueAt<createdAt)
    throw new Error("SLA deadline cannot precede visit registration");
  if(arrivalDueAt!==null&&completionDueAt!==null&&completionDueAt<arrivalDueAt)
    throw new Error("Completion deadline must follow arrival deadline");
  return {arrivalDueAt,completionDueAt};
}
function stage(dueAt:string|null,occurredAt:string|null,cancelled:boolean,
  nowMs:number,warningMs:number):ServiceVisitSlaStage{
  if(!dueAt)return {dueAt:null,occurredAt,status:"untracked",minutesFromDeadline:null};
  if(cancelled)return {dueAt,occurredAt,status:"cancelled",minutesFromDeadline:null};
  const due=Date.parse(dueAt);
  if(occurredAt){
    const delta=Date.parse(occurredAt)-due;
    return {dueAt,occurredAt,status:delta>0?"missed":"met",
      minutesFromDeadline:Math.ceil(delta/60000)};
  }
  const remaining=due-nowMs;
  return {dueAt,occurredAt:null,
    status:remaining<0?"overdue":remaining<=warningMs?"due_soon":"on_track",
    minutesFromDeadline:null};
}
/** Read-only, visit-scoped status. A completed visit retains missed history. */
export function buildServiceVisitSlaReport(visits:readonly ServiceVisitSlaSource[],
  asOf:string,warningMinutes=120):ServiceVisitSlaReport{
  const now=Date.parse(dateTime(asOf,"SLA evaluation timestamp"));
  if(!Number.isSafeInteger(warningMinutes)||warningMinutes<0||warningMinutes>10080)
    throw new Error("Invalid SLA warning window");
  if(!Array.isArray(visits)||visits.length>10000)throw new Error("Invalid SLA visit source");
  const rows=visits.map(v=>{
    if(!v||typeof v!=="object"||typeof v.id!=="string"||
       typeof v.orderId!=="string"||!/^\d{4}-\d\d-\d\d$/.test(v.scheduledOn)||
       !["scheduled","arrived","completed","cancelled"].includes(v.status))
      throw new Error("Invalid SLA visit");
    const sla=v.sla;
    if(sla)validateServiceVisitSla(sla,
      // Do not revalidate original site registration age here: source is already
      // validated by the authoritative site-visit snapshot and store.
      "2000-01-01T00:00:00.000Z");
    const cancelled=v.status==="cancelled";
    return {visitId:v.id,orderId:v.orderId,scheduledOn:v.scheduledOn,siteStatus:v.status,
      arrival:stage(sla?.arrivalDueAt??null,v.arrivedAt,cancelled,now,warningMinutes*60000),
      completion:stage(sla?.completionDueAt??null,v.completedAt,cancelled,now,warningMinutes*60000)};
  });
  rows.sort((a,b)=>{
    const priority=(v:ServiceVisitSlaRow)=>{
      const s=[v.arrival.status,v.completion.status];
      return s.includes("overdue")?0:s.includes("due_soon")?1:s.includes("missed")?2:3;
    };
    return priority(a)-priority(b)||a.scheduledOn.localeCompare(b.scheduledOn)||
      a.visitId.localeCompare(b.visitId);
  });
  return {
    trackedVisits:rows.filter(r=>r.arrival.dueAt||r.completion.dueAt).length,
    overdueVisits:rows.filter(r=>r.arrival.status==="overdue"||r.completion.status==="overdue").length,
    dueSoonVisits:rows.filter(r=>r.arrival.status==="due_soon"||r.completion.status==="due_soon").length,
    missedVisits:rows.filter(r=>r.arrival.status==="missed"||r.completion.status==="missed").length,
    cancelledVisits:rows.filter(r=>r.siteStatus==="cancelled"&&(r.arrival.dueAt||r.completion.dueAt)).length,
    rows,
  };
}
function csvCell(input:string):string {
  // For staff exports that may be opened in Excel, guard against formula execution.
  const neutralized=/^[\t\r\n ]*[=+\-@]/.test(input)?"'"+input:input;
  return '"'+neutralized.replace(/"/g,'""')+'"';
}
export function exportServiceVisitSlaCsv(report:ServiceVisitSlaReport):string{
  const header=["Visit ID","Order ID","Date","Visit status","Arrival due",
    "Arrived","Arrival SLA","Completion due","Completed","Completion SLA"];
  const output=[header.map(csvCell).join(",")];
  for(const r of report.rows){
    output.push([r.visitId,r.orderId,r.scheduledOn,r.siteStatus,
      r.arrival.dueAt??"",r.arrival.occurredAt??"",r.arrival.status,
      r.completion.dueAt??"",r.completion.occurredAt??"",r.completion.status]
      .map(csvCell).join(","));
  }
  return output.join("\r\n")+"\r\n";
}
