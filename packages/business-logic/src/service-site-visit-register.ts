/**
 * SVC-005 — real Windows Offline field visit lifecycle, separate from order
 * financial posting and technician attendance. No GPS verification is implied.
 * Cloud production editing is deliberately denied until tenant-safe storage exists.
 */
import {generateId, nowISO} from "@minarvabiz/utils";
import {assertPermission} from "./permissions";
import {isProductionMode} from "./runtime-mode";
import {getActiveBranch} from "./phase9-store";
import {auditAction} from "./audit-actions";
import {touchPersistence} from "./autosave";
import * as ordersStore from "./orders-store";
import * as staffStore from "./phase6-store";

export type SiteVisitStatus = "scheduled" | "arrived" | "completed" | "cancelled";
export interface ServiceSiteVisit {
  readonly id:string;
  readonly branchId:string;
  readonly orderId:string;
  readonly customerId:string;
  readonly assignmentId:string;
  readonly staffId:string;
  readonly scheduledOn:string;
  readonly siteAddress:string;
  readonly notes:string;
  readonly status:SiteVisitStatus;
  readonly arrivedAt:string|null;
  readonly completedAt:string|null;
  readonly cancellationReason:string|null;
  readonly version:number;
  readonly createdAt:string;
  readonly updatedAt:string;
}
const records:ServiceSiteVisit[]=[];
const CAPACITY=10_000;
const FIELDS=["id","branchId","orderId","customerId","assignmentId","staffId",
 "scheduledOn","siteAddress","notes","status","arrivedAt","completedAt",
 "cancellationReason","version","createdAt","updatedAt"];
function id(value:unknown,label:string):string{
  if(typeof value!=="string"||value.length<1||value.length>128||
    value.trim()!==value||/[\r\n]/.test(value))throw new Error("Invalid "+label);
  return value;
}
function memo(value:unknown,label:string,max:number,required=false):string{
  if(typeof value!=="string"||value.length>max||/[\u0000-\u001f]/.test(value)||
    (required&&!value.trim()))throw new Error("Invalid "+label);
  return value.trim();
}
function date(value:unknown):string{
  if(typeof value!=="string"||!/^20\d{2}-\d\d-\d\d$/.test(value))throw new Error("Invalid site visit date");
  const d=new Date(value+"T00:00:00.000Z");
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw new Error("Invalid site visit date");
  return value;
}
function instant(value:unknown,label:string):string{
  if(typeof value!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(value)||
    !Number.isFinite(Date.parse(value)))throw new Error("Invalid "+label);
  return value;
}
function nullableInstant(value:unknown,label:string):string|null{
  return value===null?null:instant(value,label);
}
function record(value:unknown):ServiceSiteVisit{
  if(value===null||typeof value!=="object"||Array.isArray(value))throw new Error("Invalid site visit record");
  const o=value as Record<string,unknown>;
  if(Object.keys(o).some(k=>!FIELDS.includes(k)))throw new Error("Unknown site visit snapshot field");
  const v={
    id:id(o.id,"visit id"),branchId:id(o.branchId,"branch"),
    orderId:id(o.orderId,"order"),customerId:id(o.customerId,"customer"),
    assignmentId:id(o.assignmentId,"assignment"),staffId:id(o.staffId,"staff"),
    scheduledOn:date(o.scheduledOn),
    siteAddress:memo(o.siteAddress,"site address",500,true),
    notes:memo(o.notes,"visit notes",2000),
    status:o.status as SiteVisitStatus,
    arrivedAt:nullableInstant(o.arrivedAt,"site arrival"),
    completedAt:nullableInstant(o.completedAt,"site completion"),
    cancellationReason:o.cancellationReason===null?null:memo(o.cancellationReason,"cancellation reason",500,true),
    version:o.version as number,
    createdAt:instant(o.createdAt,"visit creation"),
    updatedAt:instant(o.updatedAt,"visit update"),
  };
  if(!["scheduled","arrived","completed","cancelled"].includes(v.status)||
    !Number.isSafeInteger(v.version)||v.version<1||v.updatedAt<v.createdAt){
    throw new Error("Invalid site visit state or revision");
  }
  const validTimeline =
    (v.status==="scheduled"&&v.arrivedAt===null&&v.completedAt===null&&v.cancellationReason===null)||
    (v.status==="arrived"&&v.arrivedAt!==null&&v.completedAt===null&&v.cancellationReason===null)||
    (v.status==="completed"&&v.arrivedAt!==null&&v.completedAt!==null&&v.cancellationReason===null)||
    (v.status==="cancelled"&&v.arrivedAt===null&&v.completedAt===null&&v.cancellationReason!==null);
  if(!validTimeline||(v.arrivedAt!==null&&v.arrivedAt<v.createdAt)||
    (v.completedAt!==null&&(v.arrivedAt===null||v.completedAt<v.arrivedAt))){
    throw new Error("Invalid site visit lifecycle chronology");
  }
  return v;
}
/** Pure validation precedes snapshot mutation; older backups have no visit key. */
export function validateServiceSiteVisits(input:unknown):ServiceSiteVisit[]{
  if(input==null)return [];
  if(!Array.isArray(input)||input.length>CAPACITY)throw new Error("Invalid site visit snapshot");
  const ids=new Set<string>(),scheduled=new Set<string>();
  return input.map(raw=>{
    const v=record(raw),key=JSON.stringify([v.branchId,v.orderId,v.assignmentId,v.scheduledOn]);
    if(ids.has(v.id)||scheduled.has(key))throw new Error("Duplicate service site visit");
    ids.add(v.id);scheduled.add(key);
    return v;
  });
}
export function exportServiceSiteVisits():ServiceSiteVisit[]{
  return records.map(v=>({...v}));
}
export function hydrateServiceSiteVisits(input:unknown):void{
  const verified=validateServiceSiteVisits(input);
  records.splice(0,records.length,...verified);
}
function branch():string{
  const b=getActiveBranch();
  if(!b||!b.isActive||b.deletedAt)throw new Error("Select an active site-visit branch");
  return b.id;
}
function writable():void{
  const desktop=typeof window!=="undefined"&&
    Boolean((window as unknown as {minarvaDesktop?:unknown}).minarvaDesktop);
  if(isProductionMode()&&!desktop)throw new Error("Site visit editing requires installed Windows SQLite");
}
function linkedOrder(orderId:string,branchId:string){
  const order=ordersStore.getOrder(orderId);
  if(!order||order.deletedAt||order.branchId!==branchId||
    order.status==="cancelled"||order.status==="delivered"){
    throw new Error("Site visit needs an active order with verified branch");
  }
  return order;
}
function linkedAssignment(assignmentId:string,orderId:string,branchId:string){
  const a=staffStore.listAssignments({orderId}).find(x=>x.id===assignmentId);
  if(!a||a.orderId!==orderId||a.status==="cancelled"||a.status==="completed"||
    !staffStore.getStaff(a.staffId)||staffStore.getStaff(a.staffId)?.status!=="active"){
    throw new Error("Site visit needs an active technician assignment");
  }
  linkedOrder(orderId,branchId);
  return a;
}
export function listServiceSiteVisits():ServiceSiteVisit[]{
  assertPermission("reports.view");
  const active=branch();
  return records.filter(v=>v.branchId===active).map(v=>({...v}))
    .sort((a,b)=>b.scheduledOn.localeCompare(a.scheduledOn)||a.id.localeCompare(b.id));
}
export function scheduleServiceSiteVisit(input:{
  orderId:string;assignmentId:string;scheduledOn:string;siteAddress:string;notes?:string;
}):ServiceSiteVisit{
  assertPermission("orders.assign");writable();
  const branchId=branch(),orderId=id(input.orderId,"order id");
  const order=linkedOrder(orderId,branchId);
  const assignmentId=id(input.assignmentId,"assignment id");
  const assignment=linkedAssignment(assignmentId,orderId,branchId);
  const scheduledOn=date(input.scheduledOn);
  if(scheduledOn<order.orderDate.slice(0,10))throw new Error("Visit cannot precede service order");
  const siteAddress=memo(input.siteAddress,"site address",500,true);
  const notes=memo(input.notes??"","visit notes",2000);
  if(records.length>=CAPACITY)throw new Error("Site visit register is full");
  if(records.some(v=>v.branchId===branchId&&v.orderId===orderId&&
    v.assignmentId===assignmentId&&v.scheduledOn===scheduledOn)){
    throw new Error("Visit already scheduled for this order/technician/day");
  }
  const now=nowISO();
  const v=record({id:generateId(),branchId,orderId,customerId:order.customerId,
    assignmentId,staffId:assignment.staffId,scheduledOn,siteAddress,notes,
    status:"scheduled",arrivedAt:null,completedAt:null,cancellationReason:null,
    version:1,createdAt:now,updatedAt:now});
  records.push(v);
  auditAction("service_site_visit.schedule","service_site_visit",v.id,null,v);
  touchPersistence();
  return {...v};
}
function transition(input:{
  visitId:string;expectedVersion:number;action:"arrive"|"complete"|"cancel";reason?:string;
}):ServiceSiteVisit{
  assertPermission("orders.assign");writable();
  const branchId=branch();
  const i=records.findIndex(v=>v.id===input.visitId&&v.branchId===branchId);
  if(i<0)throw new Error("Site visit not found in active branch");
  const before=records[i];
  if(before.version!==input.expectedVersion)throw new Error("Site visit changed; refresh first");
  linkedOrder(before.orderId,branchId);
  if(input.action==="arrive"&&before.status!=="scheduled"||
     input.action==="complete"&&before.status!=="arrived"||
     input.action==="cancel"&&before.status!=="scheduled"){
    throw new Error("Invalid site visit status transition");
  }
  if(input.action==="arrive")linkedAssignment(before.assignmentId,before.orderId,branchId);
  const now=nowISO();
  const reason=input.action==="cancel"?memo(input.reason??"","cancellation reason",500,true):null;
  if(input.action==="cancel"&&(reason?.length??0)<3)throw new Error("Cancellation reason required");
  const next=record({...before,
    status:input.action==="arrive"?"arrived":input.action==="complete"?"completed":"cancelled",
    arrivedAt:input.action==="arrive"?now:before.arrivedAt,
    completedAt:input.action==="complete"?now:null,
    cancellationReason:reason,version:before.version+1,updatedAt:now});
  records.splice(i,1,next);
  auditAction("service_site_visit."+input.action,"service_site_visit",next.id,before,next);
  touchPersistence();
  return {...next};
}
export function markServiceSiteArrival(visitId:string,expectedVersion:number):ServiceSiteVisit{
  return transition({visitId,expectedVersion,action:"arrive"});
}
export function completeServiceSiteVisit(visitId:string,expectedVersion:number):ServiceSiteVisit{
  return transition({visitId,expectedVersion,action:"complete"});
}
export function cancelServiceSiteVisit(visitId:string,expectedVersion:number,reason:string):ServiceSiteVisit{
  return transition({visitId,expectedVersion,action:"cancel",reason});
}
