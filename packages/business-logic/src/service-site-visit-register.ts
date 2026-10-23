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
import * as productsStore from "./store";
import {
  costPartMinor, parseServicePartQuantity, validateServiceVisitPart, validateServiceVisitParts,
  SERVICE_VISIT_MAX_PARTS, type ServiceVisitPart,
} from "./service-visit-parts";
import {
  validateServiceVisitEvidence, validateServiceVisitEvidenceList,
  serviceVisitEvidenceBytes, SITE_EVIDENCE_MAX_VISIT_FILES,
  SITE_EVIDENCE_MAX_SNAPSHOT_BYTES, type ServiceSiteVisitEvidence,
  type SiteEvidenceMime, type SiteEvidencePurpose,
} from "./service-site-visit-evidence";
import {
  SITE_VISIT_HANDOVER_NOTICE, handoverImageBytes, safeHandoverAudit,
  validateHandoverPng, validateSiteVisitHandover, type SiteVisitHandover,
} from "./service-site-visit-signature";
import {validateServiceVisitSla,type ServiceVisitSlaTargets} from "./service-visit-sla";
import {validateServiceRouteSequence} from "./service-visit-route-planner";
import {validateServiceVisitFeedback,feedbackAuditMetadata,
  type ServiceVisitFeedback,type ServiceVisitFeedbackSource} from "./service-visit-feedback";

export type SiteVisitStatus = "scheduled" | "arrived" | "completed" | "cancelled";
export type SiteVisitCheckResult = "pending" | "passed" | "failed" | "not_applicable";
export interface ServiceSiteVisitCheck {
  readonly id:string;
  readonly label:string;
  readonly required:boolean;
  readonly result:SiteVisitCheckResult;
  readonly notes:string;
  readonly checkedAt:string|null;
}
/** Deliberately generic; does not claim equipment-specific certification. */
export const DEFAULT_SITE_VISIT_CHECKS:readonly {id:string;label:string;required:boolean}[]=[
  {id:"safety",label:"Inspect site power and safety",required:true},
  {id:"equipment",label:"Inspect equipment and cabling",required:true},
  {id:"function",label:"Verify service equipment operation",required:true},
  {id:"handover",label:"Confirm site handover/check outcome",required:true},
];
function newSiteVisitChecklist():ServiceSiteVisitCheck[]{
  return DEFAULT_SITE_VISIT_CHECKS.map(c=>({...c,result:"pending",notes:"",checkedAt:null}));
}
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
  /** Optional for existing pre-SVC-006 snapshots; present on new visits. */
  readonly checklist?:ServiceSiteVisitCheck[];
  /** Optional for older snapshots; bounded file data stored in Windows SQLite snapshot. */
  readonly evidence?:ServiceSiteVisitEvidence[];
  /** Optional on historic visits; new site visits require handover acknowledgment/decline. */
  readonly handover?:SiteVisitHandover|null;
  /** Optional immutable visit-level arrival/completion target, never a contract-level SLA. */
  readonly sla?:ServiceVisitSlaTargets;
  /** Staff-recorded parts; no stock movement, COGS or invoice posting. */
  readonly parts?:ServiceVisitPart[];
  /** Manual technician/day sequence. Null means unsequenced; no GPS/route optimization. */
  readonly routeSequence?:number|null;
  /** Optional for historical snapshots. New visits begin with no response. */
  readonly feedback?:ServiceVisitFeedback|null;
}
const records:ServiceSiteVisit[]=[];
const CAPACITY=10_000;
const FIELDS=["id","branchId","orderId","customerId","assignmentId","staffId",
 "scheduledOn","siteAddress","notes","status","arrivedAt","completedAt",
 "cancellationReason","version","createdAt","updatedAt","checklist","evidence","handover","sla","parts","routeSequence","feedback"];
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
function validChecklist(input:unknown,arrivedAt:string|null,updatedAt:string,status:SiteVisitStatus):ServiceSiteVisitCheck[]{
  if(!Array.isArray(input)||input.length===0||input.length>40)
    throw new Error("Invalid site visit checklist collection");
  const ids=new Set<string>();
  return input.map(raw=>{
    if(!raw||typeof raw!=="object"||Array.isArray(raw))
      throw new Error("Invalid site visit checklist item");
    const item=raw as Record<string,unknown>;
    if(Object.keys(item).some(k=>!["id","label","required","result","notes","checkedAt"].includes(k)))
      throw new Error("Unknown site visit checklist field");
    const itemId=id(item.id,"checklist item id");
    if(!/^[a-z][a-z0-9_-]{0,63}$/.test(itemId)||ids.has(itemId))
      throw new Error("Duplicate or invalid site visit checklist item");
    ids.add(itemId);
    const label=memo(item.label,"checklist label",160,true);
    if(typeof item.required!=="boolean")throw new Error("Invalid checklist requirement");
    const result=item.result as SiteVisitCheckResult;
    if(!["pending","passed","failed","not_applicable"].includes(result))
      throw new Error("Invalid checklist result");
    const notes=memo(item.notes,"checklist notes",500);
    const checkedAt=nullableInstant(item.checkedAt,"checklist confirmation");
    if(result==="pending"){
      if(checkedAt!==null||notes)throw new Error("Pending checklist item cannot have response");
    }else{
      if(!arrivedAt||!checkedAt||checkedAt<arrivedAt||checkedAt>updatedAt)
        throw new Error("Checklist confirmation must follow site arrival");
      if((result==="failed"||result==="not_applicable")&&notes.length<3)
        throw new Error("Failed or inapplicable checklist requires reason");
    }
    if((status==="scheduled"||status==="cancelled")&&result!=="pending")
      throw new Error("Unarrived site visit cannot have checklist responses");
    if(status==="completed"&&item.required&&result!=="passed"&&result!=="not_applicable")
      throw new Error("Required checklist items must be resolved before completion");
    return {id:itemId,label,required:item.required,result,notes,checkedAt};
  });
}
function cloneVisit(v:ServiceSiteVisit):ServiceSiteVisit{
  return {...v,...(v.checklist?{checklist:v.checklist.map(c=>({...c}))}:{}),
    ...(v.evidence?{evidence:v.evidence.map(e=>({...e}))}:{}),
    ...(Object.hasOwn(v,"handover")?{handover:v.handover?{...v.handover}:null}:{}),
    ...(v.sla?{sla:{...v.sla}}:{}),...(v.parts?{parts:v.parts.map(p=>({...p}))}:{}),
    ...(Object.hasOwn(v,"feedback")?{feedback:v.feedback?{...v.feedback}:null}:{})};
}
/** All visit audit paths must exclude both attachments and signature image bytes. */
function auditVisit(v:ServiceSiteVisit){
  return {...v,
    ...(v.evidence?{evidence:v.evidence.map(({dataBase64:unused,...meta})=>{
      void unused;return meta;
    })}:{}),
    ...(Object.hasOwn(v,"handover")?{handover:safeHandoverAudit(v.handover)}:{}),
    ...(Object.hasOwn(v,"feedback")?{feedback:feedbackAuditMetadata(v.feedback)}:{})};
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
  const validated=Object.hasOwn(o,"checklist")
    ? {...v,checklist:validChecklist(o.checklist,v.arrivedAt,v.updatedAt,v.status)} : v;
  const withEvidence=Object.hasOwn(o,"evidence")
    ? {...validated,evidence:validateServiceVisitEvidenceList(
        o.evidence,v.arrivedAt,v.updatedAt,v.status)} : validated;
  const withHandover=Object.hasOwn(o,"handover")
    ? {...withEvidence,handover:validateSiteVisitHandover(
        o.handover,v.arrivedAt,v.updatedAt,v.status)} : withEvidence;
  const withSla=Object.hasOwn(o,"sla")
    ? {...withHandover,sla:validateServiceVisitSla(o.sla,v.createdAt)} : withHandover;
  const withParts=Object.hasOwn(o,"parts")
    ? {...withSla,parts:validateServiceVisitParts(o.parts,v.arrivedAt,v.updatedAt,v.status)}
    : withSla;
  const withRoute=Object.hasOwn(o,"routeSequence")
    ? {...withParts,routeSequence:validateServiceRouteSequence(o.routeSequence)}
    : withParts;
  return Object.hasOwn(o,"feedback")
    ? {...withRoute,feedback:validateServiceVisitFeedback(
        o.feedback,v.completedAt,v.updatedAt,v.status)} : withRoute;
}
/** Pure validation precedes snapshot mutation; older backups have no visit key. */
export function validateServiceSiteVisits(input:unknown):ServiceSiteVisit[]{
  if(input==null)return [];
  if(!Array.isArray(input)||input.length>CAPACITY)throw new Error("Invalid site visit snapshot");
  const ids=new Set<string>(),scheduled=new Set<string>(),routeSlots=new Set<string>();
  let totalBytes=0;
  return input.map(raw=>{
    const v=record(raw),key=JSON.stringify([v.branchId,v.orderId,v.assignmentId,v.scheduledOn]);
    if(ids.has(v.id)||scheduled.has(key))throw new Error("Duplicate service site visit");
    if((v.status==="scheduled"||v.status==="arrived")&&v.routeSequence!=null){
      const routeKey=JSON.stringify([v.branchId,v.staffId,v.scheduledOn,v.routeSequence]);
      if(routeSlots.has(routeKey))throw new Error("Duplicate technician route stop number");
      routeSlots.add(routeKey);
    }
    totalBytes+=serviceVisitEvidenceBytes(v.evidence??[])+handoverImageBytes(v.handover);
    if(totalBytes>SITE_EVIDENCE_MAX_SNAPSHOT_BYTES)
      throw new Error("Total offline site evidence exceeds snapshot capacity");
    ids.add(v.id);scheduled.add(key);
    return v;
  });
}
export function exportServiceSiteVisits():ServiceSiteVisit[]{
  return records.map(cloneVisit);
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
  return records.filter(v=>v.branchId===active).map(cloneVisit)
    .sort((a,b)=>b.scheduledOn.localeCompare(a.scheduledOn)||a.id.localeCompare(b.id));
}
export function scheduleServiceSiteVisit(input:{
  orderId:string;assignmentId:string;scheduledOn:string;siteAddress:string;notes?:string;
  sla?:ServiceVisitSlaTargets;
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
    version:1,createdAt:now,updatedAt:now,checklist:newSiteVisitChecklist(),evidence:[],handover:null,
    ...(input.sla?{sla:validateServiceVisitSla(input.sla,now)}:{}),parts:[],routeSequence:null,feedback:null});
  records.push(v);
  auditAction("service_site_visit.schedule","service_site_visit",v.id,null,auditVisit(v));
  touchPersistence();
  return cloneVisit(v);
}
/** Assign/release a route stop number for this technician and planned day.
 * CAS, branch scoping and linked assignment protect against stale/forged writes.
 * No stock/accounting posting or third-party traffic calculation.
 */
export function setServiceSiteVisitRouteSequence(input:{
  visitId:string;expectedVersion:number;routeSequence:number|null;
}):ServiceSiteVisit{
  assertPermission("orders.assign");writable();
  const active=branch();
  const i=records.findIndex(v=>v.id===input.visitId&&v.branchId===active);
  if(i<0)throw new Error("Visit not found in active branch");
  const old=records[i];
  if(old.version!==input.expectedVersion)throw new Error("Site visit changed; refresh first");
  if(old.status!=="scheduled"&&old.status!=="arrived")
    throw new Error("Cannot resequence a closed site visit");
  linkedOrder(old.orderId,active);
  linkedAssignment(old.assignmentId,old.orderId,active);
  const number=validateServiceRouteSequence(input.routeSequence);
  if(number!==null&&records.some(v=>v.id!==old.id&&v.branchId===active&&
    v.staffId===old.staffId&&v.scheduledOn===old.scheduledOn&&
    (v.status==="scheduled"||v.status==="arrived")&&v.routeSequence===number))
    throw new Error("Route stop number already used for this technician/day");
  if(old.routeSequence===number)return cloneVisit(old);
  const next=record({...old,routeSequence:number,version:old.version+1,
    updatedAt:nowISO()});
  records.splice(i,1,next);
  auditAction("service_site_visit.route_sequence","service_site_visit",next.id,
    {version:old.version,routeSequence:old.routeSequence??null},
    {version:next.version,routeSequence:number});
  touchPersistence();
  return cloneVisit(next);
}
export function startLegacySiteVisitChecklist(visitId:string,expectedVersion:number):ServiceSiteVisit{
  assertPermission("orders.assign");writable();
  const branchId=branch();
  const i=records.findIndex(v=>v.id===visitId&&v.branchId===branchId);
  if(i<0)throw new Error("Site visit not found in active branch");
  const before=records[i];
  if(before.version!==expectedVersion)throw new Error("Site visit changed; refresh first");
  if(before.status!=="arrived"||before.checklist)
    throw new Error("Checklist can only be initialized on a legacy arrived visit");
  linkedOrder(before.orderId,branchId);
  linkedAssignment(before.assignmentId,before.orderId,branchId);
  const now=nowISO();
  const next=record({...before,checklist:newSiteVisitChecklist(),version:before.version+1,updatedAt:now});
  records.splice(i,1,next);
  auditAction("service_site_visit.checklist_initialize","service_site_visit",next.id,auditVisit(before),auditVisit(next));
  touchPersistence();
  return cloneVisit(next);
}
export function setServiceSiteVisitCheck(input:{
  visitId:string;expectedVersion:number;itemId:string;
  result:SiteVisitCheckResult;notes?:string;
}):ServiceSiteVisit{
  assertPermission("orders.assign");writable();
  const branchId=branch();
  const i=records.findIndex(v=>v.id===input.visitId&&v.branchId===branchId);
  if(i<0)throw new Error("Site visit not found in active branch");
  const before=records[i];
  if(before.version!==input.expectedVersion)throw new Error("Site visit changed; refresh first");
  if(before.status!=="arrived"||!before.checklist)
    throw new Error("Checklist can only be edited after site arrival");
  linkedOrder(before.orderId,branchId);
  linkedAssignment(before.assignmentId,before.orderId,branchId);
  if(!["pending","passed","failed","not_applicable"].includes(input.result))
    throw new Error("Invalid checklist result");
  const notes=input.result==="pending"?"":memo(input.notes??"","checklist notes",500);
  if((input.result==="failed"||input.result==="not_applicable")&&notes.length<3)
    throw new Error("Failed or inapplicable checklist requires reason");
  if(!before.checklist.some(c=>c.id===input.itemId))
    throw new Error("Unknown checklist item");
  const now=nowISO();
  const next=record({...before,version:before.version+1,updatedAt:now,
    checklist:before.checklist.map(c=>c.id===input.itemId?{
      ...c,result:input.result,notes,checkedAt:input.result==="pending"?null:now,
    }:c)});
  records.splice(i,1,next);
  auditAction("service_site_visit.checklist_update","service_site_visit",next.id,auditVisit(before),auditVisit(next));
  touchPersistence();
  return cloneVisit(next);
}
function evidenceAudit(e:ServiceSiteVisitEvidence){
  // Never copy photo/document content into audit events or telemetry.
  const {dataBase64:ignored,...meta}=e;
  void ignored;
  return meta;
}
function editEvidence(visitId:string,expectedVersion:number,
  update:(v:ServiceSiteVisit,now:string)=>{next:ServiceSiteVisit;evidence:ServiceSiteVisitEvidence;kind:"add"|"remove";reason?:string}):ServiceSiteVisit{
  assertPermission("orders.assign");writable();
  const active=branch();
  const i=records.findIndex(v=>v.id===visitId&&v.branchId===active);
  if(i<0)throw new Error("Site evidence not found in active branch");
  const previous=records[i];
  if(previous.version!==expectedVersion)throw new Error("Site visit changed; refresh first");
  if(previous.status!=="arrived")throw new Error("Site evidence can only change after arrival, before completion");
  linkedOrder(previous.orderId,active);
  linkedAssignment(previous.assignmentId,previous.orderId,active);
  const {next,evidence,kind,reason}=update(previous,nowISO());
  const checked=record(next);
  const total=records.reduce((sum,v)=>sum+
    (v.id===previous.id&&v.branchId===previous.branchId?0:serviceVisitEvidenceBytes(v.evidence??[])),0)+
    serviceVisitEvidenceBytes(checked.evidence??[]);
  if(total>SITE_EVIDENCE_MAX_SNAPSHOT_BYTES)
    throw new Error("Total offline site evidence exceeds snapshot capacity");
  records.splice(i,1,checked);
  auditAction("service_site_visit.evidence_"+kind,"service_site_visit",checked.id,
    {version:previous.version},{version:checked.version,evidence:evidenceAudit(evidence),...(reason?{reason}:{})});
  touchPersistence();
  return cloneVisit(checked);
}
export function addServiceSiteVisitEvidence(input:{
  readonly visitId:string;readonly expectedVersion:number;readonly fileName:string;
  readonly mimeType:SiteEvidenceMime;readonly purpose:SiteEvidencePurpose;
  readonly notes?:string;readonly byteLength:number;readonly dataBase64:string;
}):ServiceSiteVisit{
  return editEvidence(input.visitId,input.expectedVersion,(v,now)=>{
    if((v.evidence?.length??0)>=SITE_EVIDENCE_MAX_VISIT_FILES)
      throw new Error("This visit already has the maximum evidence attachments");
    const evidence=validateServiceVisitEvidence({id:generateId(),fileName:input.fileName,
      mimeType:input.mimeType,purpose:input.purpose,notes:input.notes??"",
      byteLength:input.byteLength,dataBase64:input.dataBase64,uploadedAt:now});
    return {kind:"add" as const,evidence,
      next:{...v,version:v.version+1,updatedAt:now,
        evidence:[...(v.evidence??[]),evidence]}};
  });
}
export function removeServiceSiteVisitEvidence(input:{
  readonly visitId:string;readonly expectedVersion:number;readonly evidenceId:string;
  readonly reason:string;
}):ServiceSiteVisit{
  return editEvidence(input.visitId,input.expectedVersion,(v,now)=>{
    const existing=v.evidence?.find(e=>e.id===input.evidenceId);
    if(!existing)throw new Error("Evidence attachment not found");
    const reason=memo(input.reason,"evidence removal reason",500,true);
    if(reason.length<3)throw new Error("Evidence removal reason required");
    return {kind:"remove" as const,evidence:existing,reason,
      next:{...v,version:v.version+1,updatedAt:now,
        evidence:(v.evidence??[]).filter(e=>e.id!==existing.id)}};
  });
}
/**
 * Capture the customer's drawn acknowledgement or an explicit, reasoned refusal.
 * One outcome per visit; no replacement after consent, and no network call.
 */
function setHandover(input:{
  visitId:string;expectedVersion:number;
  handover:Omit<SiteVisitHandover,"confirmedAt">;
}):ServiceSiteVisit{
  assertPermission("orders.assign");writable();
  const active=branch();
  const i=records.findIndex(v=>v.id===input.visitId&&v.branchId===active);
  if(i<0)throw new Error("Site handover not found in active branch");
  const before=records[i];
  if(before.version!==input.expectedVersion)throw new Error("Site visit changed; refresh first");
  if(before.status!=="arrived"||!Object.hasOwn(before,"handover")||before.handover!==null)
    throw new Error("Customer handover can only be recorded once after site arrival");
  linkedOrder(before.orderId,active);
  linkedAssignment(before.assignmentId,before.orderId,active);
  const now=nowISO();
  const handover=validateSiteVisitHandover({...input.handover,confirmedAt:now},
    before.arrivedAt,now,before.status);
  if(!handover)throw new Error("Handover result is required");
  const next=record({...before,handover,version:before.version+1,updatedAt:now});
  const total=records.reduce((n,v)=>n+serviceVisitEvidenceBytes(v.evidence??[])+
    (v.id===before.id&&v.branchId===before.branchId?0:handoverImageBytes(v.handover)),0)+
    handoverImageBytes(handover);
  if(total>SITE_EVIDENCE_MAX_SNAPSHOT_BYTES)
    throw new Error("Total local field evidence exceeds snapshot capacity");
  records.splice(i,1,next);
  auditAction("service_site_visit.handover","service_site_visit",next.id,
    {version:before.version},{version:next.version,handover:safeHandoverAudit(handover)});
  touchPersistence();
  return cloneVisit(next);
}
export function captureServiceVisitSignature(input:{
  visitId:string;expectedVersion:number;signerName:string;signaturePngBase64:string;
}):ServiceSiteVisit{
  const signaturePngBase64=validateHandoverPng(input.signaturePngBase64);
  return setHandover({visitId:input.visitId,expectedVersion:input.expectedVersion,
    handover:{status:"signed",signerName:input.signerName,signaturePngBase64,
      reason:null,notice:SITE_VISIT_HANDOVER_NOTICE}});
}
export function recordServiceVisitSignatureDecline(input:{
  visitId:string;expectedVersion:number;reason:string;
}):ServiceSiteVisit{
  return setHandover({visitId:input.visitId,expectedVersion:input.expectedVersion,
    handover:{status:"declined",signerName:null,signaturePngBase64:null,
      reason:input.reason,notice:SITE_VISIT_HANDOVER_NOTICE}});
}
/**
 * Manual offline evidence of parts installed/used, deliberately NOT a stock debit.
 * Store cost snapshot in integer minor units, so future posting can reconcile
 * using a separate authorized idempotent financial/stock transaction.
 */
export function recordServiceVisitPart(input:{
  readonly visitId:string;readonly expectedVersion:number;readonly productId:string;
  readonly quantity:string;readonly notes?:string;
}):ServiceSiteVisit{
  assertPermission("orders.assign");writable();
  const active=branch();
  const idx=records.findIndex(v=>v.id===input.visitId&&v.branchId===active);
  if(idx<0)throw new Error("Visit part record not found in active branch");
  const old=records[idx];
  if(old.version!==input.expectedVersion)throw new Error("Site visit changed; refresh first");
  if(old.status!=="arrived")throw new Error("Parts can only be recorded during an arrived visit");
  linkedOrder(old.orderId,active);
  linkedAssignment(old.assignmentId,old.orderId,active);
  if((old.parts?.length??0)>=SERVICE_VISIT_MAX_PARTS)
    throw new Error("Maximum service part entries reached");
  const productId=id(input.productId,"service part product id");
  const product=productsStore.getProduct(productId);
  if(!product||!product.isActive||(product.branchId!=null&&product.branchId!==active))
    throw new Error("Select an active product from this branch or the shared catalog");
  const quantityMilli=parseServicePartQuantity(input.quantity);
  const cost=Math.round(product.costPrice*100);
  if(!Number.isSafeInteger(cost)||cost<0||
     Math.abs(cost/100-product.costPrice)>0.000001)
    throw new Error("Product has invalid precise cost");
  const notes=memo(input.notes??"","part usage notes",500);
  const now=nowISO();
  const item=validateServiceVisitPart({
    id:generateId(),productId:product.id,productName:product.name,
    sku:product.sku??null,unit:product.unit,quantityMilli,
    unitCostMinor:cost,totalCostMinor:costPartMinor(quantityMilli,cost),
    notes,recordedAt:now,status:"used",voidedAt:null,voidReason:null,
  },old.arrivedAt,now,old.status);
  const next=record({...old,parts:[...(old.parts??[]),item],
    version:old.version+1,updatedAt:now});
  records.splice(idx,1,next);
  auditAction("service_site_visit.part_record","service_site_visit",next.id,
    {version:old.version},{version:next.version,part:{...item},stockPosted:false});
  touchPersistence();
  return cloneVisit(next);
}
export function voidServiceVisitPart(input:{
  readonly visitId:string;readonly expectedVersion:number;readonly partId:string;
  readonly reason:string;
}):ServiceSiteVisit{
  assertPermission("orders.assign");writable();
  const active=branch();
  const idx=records.findIndex(v=>v.id===input.visitId&&v.branchId===active);
  if(idx<0)throw new Error("Visit part record not found in active branch");
  const old=records[idx];
  if(old.version!==input.expectedVersion)throw new Error("Site visit changed; refresh first");
  if(old.status!=="arrived")throw new Error("Parts can only be corrected before completion");
  linkedOrder(old.orderId,active);
  linkedAssignment(old.assignmentId,old.orderId,active);
  const part=old.parts?.find(x=>x.id===input.partId);
  if(!part||part.status!=="used")throw new Error("Active service part entry not found");
  const reason=memo(input.reason,"part correction reason",500,true);
  if(reason.length<3)throw new Error("Service part correction reason required");
  const now=nowISO();
  const corrected=validateServiceVisitPart({...part,status:"voided",
    voidedAt:now,voidReason:reason},old.arrivedAt,now,old.status);
  const next=record({...old,parts:old.parts?.map(x=>x.id===part.id?corrected:x),
    version:old.version+1,updatedAt:now});
  records.splice(idx,1,next);
  auditAction("service_site_visit.part_void","service_site_visit",next.id,
    {version:old.version},{version:next.version,partId:part.id,reason,stockPosted:false});
  touchPersistence();
  return cloneVisit(next);
}
/** Staff-only, customer-confirmed response. Never send/review/route automatically. */
export function recordServiceVisitFeedback(input:{
  visitId:string;expectedVersion:number;outcome:"rated"|"declined";
  rating:number|null;comment:string;source:ServiceVisitFeedbackSource;
  customerResponseConfirmed:boolean;
}):ServiceSiteVisit{
  assertPermission("orders.assign");writable();
  const active=branch();
  const i=records.findIndex(v=>v.id===input.visitId&&v.branchId===active);
  if(i<0)throw new Error("Feedback visit not found in active branch");
  const before=records[i];
  if(before.version!==input.expectedVersion)throw new Error("Site visit changed; refresh first");
  if(before.status!=="completed"||
    !Object.hasOwn(before,"feedback")||before.feedback!==null)
    throw new Error("Post-visit feedback can only be captured once on completed visits");
  if(input.customerResponseConfirmed!==true)
    throw new Error("Confirm the customer actually supplied or declined the response");
  // Delivered orders remain eligible after the technician visit closes; do not
  // rely on linkedOrder(), which intentionally rejects delivered order states.
  const order=ordersStore.getOrder(before.orderId);
  if(!order||order.deletedAt||order.status==="cancelled"||
    order.branchId!==active||order.customerId!==before.customerId)
    throw new Error("Feedback order/customer no longer matches active branch");
  const now=nowISO();
  const feedback=validateServiceVisitFeedback({
    outcome:input.outcome,rating:input.rating,comment:input.comment,
    source:input.source,recordedAt:now,
  },before.completedAt,now,before.status);
  if(!feedback)throw new Error("Feedback response required");
  const next=record({...before,feedback,version:before.version+1,updatedAt:now});
  records.splice(i,1,next);
  auditAction("service_site_visit.feedback","service_site_visit",next.id,
    {version:before.version},{version:next.version,
      feedback:feedbackAuditMetadata(feedback)});
  touchPersistence();
  return cloneVisit(next);
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
  if(input.action==="complete"&&before.checklist?.some(c=>
    c.required&&c.result!=="passed"&&c.result!=="not_applicable")){
    throw new Error("Resolve required site visit checklist before completion");
  }
  if(input.action==="complete"&&Object.hasOwn(before,"handover")&&before.handover===null)
    throw new Error("Record customer signature or reasoned refusal before completing visit");
  const now=nowISO();
  const reason=input.action==="cancel"?memo(input.reason??"","cancellation reason",500,true):null;
  if(input.action==="cancel"&&(reason?.length??0)<3)throw new Error("Cancellation reason required");
  const next=record({...before,
    status:input.action==="arrive"?"arrived":input.action==="complete"?"completed":"cancelled",
    arrivedAt:input.action==="arrive"?now:before.arrivedAt,
    completedAt:input.action==="complete"?now:null,
    cancellationReason:reason,version:before.version+1,updatedAt:now});
  records.splice(i,1,next);
  auditAction("service_site_visit."+input.action,"service_site_visit",next.id,auditVisit(before),auditVisit(next));
  touchPersistence();
  return cloneVisit(next);
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
