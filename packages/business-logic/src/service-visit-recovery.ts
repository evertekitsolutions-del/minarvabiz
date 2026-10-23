/**
 * SVC-FB02 — staff-managed recovery after a *recorded* low customer rating.
 * No automatic outreach, no proof that customer was actually contacted.
 */
import type {ServiceVisitFeedback} from "./service-visit-feedback";
import {feedbackNeedsRecovery} from "./service-visit-feedback";
export type RecoveryContactMethod="phone"|"whatsapp"|"in_person";
export type RecoveryStatus="open"|"contacted"|"resolved"|"closed_unresolved";
export interface ServiceVisitRecovery {
  readonly status:RecoveryStatus;
  readonly dueOn:string;
  readonly plan:string;
  readonly openedAt:string;
  readonly contactedAt:string|null;
  readonly contactMethod:RecoveryContactMethod|null;
  readonly contactNotes:string|null;
  readonly resolvedAt:string|null;
  readonly outcomeNotes:string|null;
}
const keys=["status","dueOn","plan","openedAt","contactedAt","contactMethod",
  "contactNotes","resolvedAt","outcomeNotes"];
function timestamp(v:unknown,label:string):string {
  if(typeof v!=="string"||
     !/^20\d{2}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)||
     !Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)
    throw new Error("Invalid recovery "+label);
  return v;
}
function day(v:unknown):string {
  if(typeof v!=="string"||!/^20\d{2}-\d\d-\d\d$/.test(v)||
     !Number.isFinite(Date.parse(v+"T00:00:00.000Z"))||
     new Date(v+"T00:00:00.000Z").toISOString().slice(0,10)!==v)
    throw new Error("Invalid recovery due date");
  return v;
}
function note(v:unknown,label:string,max:number):string {
  if(typeof v!=="string"||v.length>max||v.trim().length<3||
     /[\u0000-\u001f\u007f]/.test(v))
    throw new Error("Invalid recovery "+label);
  return v.trim();
}
export function validateServiceVisitRecovery(raw:unknown,
  feedback:ServiceVisitFeedback|null|undefined,status:string,
  updatedAt:string):ServiceVisitRecovery|null {
  if(raw===null)return null;
  if(!raw||typeof raw!=="object"||Array.isArray(raw))
    throw new Error("Invalid recovery record");
  if(status!=="completed"||!feedbackNeedsRecovery(feedback))
    throw new Error("Recovery requires completed visit with customer rating 1 or 2");
  const x=raw as Record<string,unknown>;
  if(keys.some(k=>!Object.hasOwn(x,k))||Object.keys(x).some(k=>!keys.includes(k)))
    throw new Error("Invalid recovery fields");
  const openedAt=timestamp(x.openedAt,"opening timestamp");
  const dueOn=day(x.dueOn),plan=note(x.plan,"action plan",800);
  const updated=timestamp(updatedAt,"visit update timestamp");
  if(!feedback||openedAt<feedback.recordedAt||openedAt>updated||dueOn<openedAt.slice(0,10))
    throw new Error("Recovery case is outside feedback chronology");
  const state=x.status as RecoveryStatus;
  if(!["open","contacted","resolved","closed_unresolved"].includes(state))
    throw new Error("Invalid recovery state");
  const contactedAt=x.contactedAt===null?null:timestamp(x.contactedAt,"contact timestamp");
  const method=x.contactMethod as RecoveryContactMethod|null;
  const contactNotes=x.contactNotes===null?null:note(x.contactNotes,"contact note",1000);
  const resolvedAt=x.resolvedAt===null?null:timestamp(x.resolvedAt,"outcome timestamp");
  const outcomeNotes=x.outcomeNotes===null?null:note(x.outcomeNotes,"outcome",1000);
  const contactFields=contactedAt!==null&&["phone","whatsapp","in_person"].includes(method as string)&&
    contactNotes!==null&&contactedAt>=openedAt&&contactedAt<=updated;
  if(state==="open"){
    if(contactedAt!==null||method!==null||contactNotes!==null||resolvedAt!==null||outcomeNotes!==null)
      throw new Error("Open recovery cannot claim contact or outcome");
  }else if(!contactFields){
    throw new Error("Recovery contact evidence required");
  }else if(state==="contacted"){
    if(resolvedAt!==null||outcomeNotes!==null)
      throw new Error("Contacted recovery cannot claim an outcome");
  }else if(!resolvedAt||!outcomeNotes||resolvedAt<contactedAt!||resolvedAt>updated){
    throw new Error("Recovery outcome timestamp and reason required");
  }
  return {status:state,dueOn,plan,openedAt,contactedAt,
    contactMethod:method,contactNotes,resolvedAt,outcomeNotes};
}
export function recoveryAudit(v:ServiceVisitRecovery|null|undefined){
  return v?{status:v.status,dueOn:v.dueOn,openedAt:v.openedAt,
    contactedAt:v.contactedAt,contactMethod:v.contactMethod,resolvedAt:v.resolvedAt}:null;
}
export type ServiceVisitRecoverySummary={
  open:number;contacted:number;overdue:number;resolved:number;closedUnresolved:number;
};
export function summarizeServiceVisitRecovery(
  cases:readonly (ServiceVisitRecovery|null|undefined)[],today:string
):ServiceVisitRecoverySummary{
  const current=day(today);
  const result={open:0,contacted:0,overdue:0,resolved:0,closedUnresolved:0};
  for(const value of cases){
    if(!value)continue;
    if(value.status==="open")result.open++;
    else if(value.status==="contacted")result.contacted++;
    else if(value.status==="resolved")result.resolved++;
    else result.closedUnresolved++;
    if((value.status==="open"||value.status==="contacted")&&value.dueOn<current)result.overdue++;
  }
  return result;
}
