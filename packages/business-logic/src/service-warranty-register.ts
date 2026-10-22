/**
 * SVC-011 — Windows Offline service warranty coverage and claim register.
 *
 * Customer/service IDs validated against the existing shared orders store.
 * Cloud production Web writes disabled without authoritative hosted persistence.
 * Not a manufacturer warranty entitlement, insurer authorization or cash refund.
 */
import { generateId, nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { isProductionMode } from "./runtime-mode";
import { auditAction } from "./audit-actions";
import { touchPersistence } from "./autosave";
import { getActiveBranch } from "./phase9-store";
import * as ordersStore from "./orders-store";

export interface ServiceWarranty {
  readonly id: string;
  readonly branchId: string;
  readonly orderId: string;
  readonly customerId: string;
  readonly assetReference: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly coverageTerms: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface ServiceWarrantyClaim {
  readonly id: string;
  readonly branchId: string;
  readonly warrantyId: string;
  readonly reportedOn: string;
  readonly issue: string;
  readonly status: "open" | "resolved" | "rejected";
  readonly resolutionNotes: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface ServiceWarrantyState {
  readonly warranties: ServiceWarranty[];
  readonly claims: ServiceWarrantyClaim[];
}
const warranties:ServiceWarranty[]=[];
const claims:ServiceWarrantyClaim[]=[];
const MAX_ITEMS=10000;
function field(x:unknown,name:string,max=128):string{
  if(typeof x!=="string"||!x.trim()||x.trim().length>max||x.trim()!==x||/[\r\n]/.test(x)){
    throw new Error("Invalid "+name);
  }
  return x;
}
function notes(x:unknown,name:string,max=500):string{
  if(typeof x!=="string"||x.length>max)throw new Error("Invalid "+name);
  return x;
}
function civil(x:unknown):string{
  if(typeof x!=="string"||!/^20\d\d-\d\d-\d\d$/.test(x))throw new Error("Invalid warranty calendar date");
  const d=new Date(x+"T00:00:00.000Z");
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==x)throw new Error("Invalid warranty calendar date");
  return x;
}
function iso(x:unknown):string{
  if(typeof x!=="string"||!/^20\d\d-\d\d-\d\dT/.test(x)||!Number.isFinite(Date.parse(x))){
    throw new Error("Invalid service warranty timestamp");
  }
  return x;
}
function positiveVersion(x:unknown):number{
  if(typeof x!=="number"||!Number.isSafeInteger(x)||x<1)throw new Error("Invalid warranty revision");
  return x;
}
function strictKeys(o:Record<string,unknown>,keys:string[]):void{
  if(Object.keys(o).some(k=>!keys.includes(k)))throw new Error("Unknown warranty backup field");
}
function warrantyRecord(x:unknown):ServiceWarranty{
  if(!x||typeof x!=="object"||Array.isArray(x))throw new Error("Invalid warranty backup record");
  const o=x as Record<string,unknown>;
  strictKeys(o,["id","branchId","orderId","customerId","assetReference","startsOn","endsOn",
    "coverageTerms","version","createdAt","updatedAt"]);
  const id=field(o.id,"warranty id"),branchId=field(o.branchId,"branch id");
  const orderId=field(o.orderId,"order id"),customerId=field(o.customerId,"customer id");
  const assetReference=field(o.assetReference,"asset reference",100);
  const startsOn=civil(o.startsOn),endsOn=civil(o.endsOn);
  if(endsOn<startsOn)throw new Error("Warranty end date precedes start date");
  const coverageTerms=notes(o.coverageTerms,"warranty terms",500);
  const version=positiveVersion(o.version),createdAt=iso(o.createdAt),updatedAt=iso(o.updatedAt);
  if(updatedAt<createdAt)throw new Error("Warranty revision precedes creation");
  return {id,branchId,orderId,customerId,assetReference,startsOn,endsOn,
    coverageTerms,version,createdAt,updatedAt};
}
function claimRecord(x:unknown):ServiceWarrantyClaim{
  if(!x||typeof x!=="object"||Array.isArray(x))throw new Error("Invalid warranty claim backup");
  const o=x as Record<string,unknown>;
  strictKeys(o,["id","branchId","warrantyId","reportedOn","issue","status",
    "resolutionNotes","version","createdAt","updatedAt"]);
  const id=field(o.id,"claim id"),branchId=field(o.branchId,"branch id");
  const warrantyId=field(o.warrantyId,"warranty id"),reportedOn=civil(o.reportedOn);
  const issue=field(o.issue,"claim issue",500);
  if(!["open","resolved","rejected"].includes(String(o.status)))throw new Error("Invalid claim status");
  const status=o.status as ServiceWarrantyClaim["status"];
  const resolutionNotes=notes(o.resolutionNotes,"resolution notes",500);
  if(status!=="open"&&resolutionNotes.trim().length<3){
    throw new Error("Closed warranty claim needs resolution reason");
  }
  if(status==="open"&&resolutionNotes!=="")throw new Error("Open warranty claim cannot have resolution note");
  const version=positiveVersion(o.version),createdAt=iso(o.createdAt),updatedAt=iso(o.updatedAt);
  if(updatedAt<createdAt)throw new Error("Warranty claim revision precedes creation");
  return {id,branchId,warrantyId,reportedOn,issue,status,resolutionNotes,version,createdAt,updatedAt};
}
export function validateServiceWarrantyState(input:unknown):ServiceWarrantyState{
  if(input==null)return {warranties:[],claims:[]};
  if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("Invalid service warranty backup");
  const state=input as Record<string,unknown>;
  strictKeys(state,["warranties","claims"]);
  if(!Array.isArray(state.warranties)||!Array.isArray(state.claims)||
      state.warranties.length>MAX_ITEMS||state.claims.length>MAX_ITEMS){
    throw new Error("Warranty backup capacity or structure invalid");
  }
  const ids=new Set<string>(),keys=new Set<string>();
  const validatedWarranties=state.warranties.map(raw=>{
    const row=warrantyRecord(raw),natural=JSON.stringify([row.branchId,row.orderId,row.assetReference.toUpperCase()]);
    if(ids.has(row.id)||keys.has(natural))throw new Error("Duplicate service warranty reference");
    ids.add(row.id);keys.add(natural);return row;
  });
  const claimsIds=new Set<string>();
  const byId=new Map(validatedWarranties.map(r=>[r.id,r]));
  const validatedClaims=state.claims.map(raw=>{
    const c=claimRecord(raw);
    if(claimsIds.has(c.id))throw new Error("Duplicate warranty claim");
    claimsIds.add(c.id);
    const w=byId.get(c.warrantyId);
    if(!w||w.branchId!==c.branchId||c.reportedOn<w.startsOn||c.reportedOn>w.endsOn){
      throw new Error("Warranty claim is outside saved warranty coverage");
    }
    return c;
  });
  return {warranties:validatedWarranties,claims:validatedClaims};
}
export function exportServiceWarrantyState():ServiceWarrantyState{
  return {warranties:warranties.map(r=>({...r})),claims:claims.map(c=>({...c}))};
}
export function hydrateServiceWarrantyState(input:unknown):void{
  const data=validateServiceWarrantyState(input);
  warranties.splice(0,warranties.length,...data.warranties);
  claims.splice(0,claims.length,...data.claims);
}
function currentBranchId():string{
  const b=getActiveBranch();
  if(!b||!b.isActive||b.deletedAt)throw new Error("Select an active branch for service warranties");
  return b.id;
}
function writable():void{
  const desktop=typeof window!=="undefined"&&Boolean((window as unknown as {minarvaDesktop?:unknown}).minarvaDesktop);
  if(isProductionMode()&&!desktop)throw new Error("Service warranty writes require installed Windows SQLite");
}
function linkedOrder(orderId:string,branchId:string){
  const order=ordersStore.getOrder(orderId);
  if(!order||order.deletedAt||order.status!=="delivered"||
     (order.branchId!=null&&order.branchId!==branchId)){
    throw new Error("Warranty requires a delivered service order in the active branch");
  }
  return order;
}
export function listServiceWarranties():ServiceWarrantyState{
  assertPermission("reports.view");
  const branchId=currentBranchId();
  const visible=warranties.filter(w=>w.branchId===branchId);
  const ids=new Set(visible.map(w=>w.id));
  return {warranties:visible.map(w=>({...w})).sort((a,b)=>a.endsOn.localeCompare(b.endsOn)),
    claims:claims.filter(c=>c.branchId===branchId&&ids.has(c.warrantyId)).map(c=>({...c}))
      .sort((a,b)=>b.reportedOn.localeCompare(a.reportedOn))};
}
export function registerServiceWarranty(input:{
  readonly orderId:string;readonly assetReference:string;
  readonly startsOn:string;readonly endsOn:string;readonly coverageTerms?:string;
}):ServiceWarranty{
  assertPermission("orders.manage");writable();
  const branchId=currentBranchId(),orderId=field(input.orderId,"order id");
  const order=linkedOrder(orderId,branchId);
  const assetReference=field(input.assetReference,"asset reference",100);
  const startsOn=civil(input.startsOn),endsOn=civil(input.endsOn);
  if(endsOn<startsOn)throw new Error("Warranty end date precedes start date");
  if(startsOn<order.orderDate.slice(0,10))throw new Error("Warranty cannot start before source service order");
  const coverageTerms=notes(input.coverageTerms??"","warranty terms");
  if(warranties.length>=MAX_ITEMS)throw new Error("Warranty register capacity exceeded");
  if(warranties.some(w=>w.branchId===branchId&&w.orderId===orderId&&
       w.assetReference.toUpperCase()===assetReference.toUpperCase())){
    throw new Error("Asset already has warranty for this service order");
  }
  const now=nowISO();
  const record=warrantyRecord({id:generateId(),branchId,orderId,
    customerId:order.customerId,assetReference,startsOn,endsOn,coverageTerms,
    version:1,createdAt:now,updatedAt:now});
  warranties.push(record);
  auditAction("service_warranty.register","service_warranty",record.id,null,record);
  touchPersistence();
  return {...record};
}
export function openServiceWarrantyClaim(input:{
  readonly warrantyId:string;readonly reportedOn:string;readonly issue:string;
}):ServiceWarrantyClaim{
  assertPermission("orders.manage");writable();
  const branchId=currentBranchId();
  const warranty=warranties.find(w=>w.branchId===branchId&&w.id===input.warrantyId);
  if(!warranty)throw new Error("Service warranty not found in active branch");
  linkedOrder(warranty.orderId,branchId);
  const reportedOn=civil(input.reportedOn),issue=field(input.issue,"claim issue",500);
  if(reportedOn<warranty.startsOn||reportedOn>warranty.endsOn)throw new Error("Claim outside warranty coverage");
  if(claims.length>=MAX_ITEMS)throw new Error("Warranty claim register full");
  if(claims.some(c=>c.warrantyId===warranty.id&&c.status==="open")){
    throw new Error("Resolve existing open warranty claim before raising another");
  }
  const now=nowISO();
  const record=claimRecord({id:generateId(),branchId,warrantyId:warranty.id,reportedOn,issue,
    status:"open",resolutionNotes:"",version:1,createdAt:now,updatedAt:now});
  claims.push(record);
  auditAction("service_warranty.claim_open","service_warranty_claim",record.id,null,record);
  touchPersistence();
  return {...record};
}
export function closeServiceWarrantyClaim(input:{
  readonly claimId:string;readonly expectedVersion:number;
  readonly status:"resolved"|"rejected";readonly resolutionNotes:string;
}):ServiceWarrantyClaim{
  assertPermission("orders.manage");writable();
  const branchId=currentBranchId();
  const i=claims.findIndex(c=>c.branchId===branchId&&c.id===input.claimId);
  if(i<0)throw new Error("Warranty claim not found in active branch");
  const prior=claims[i];
  if(prior.status!=="open")throw new Error("Warranty claim already closed");
  if(prior.version!==input.expectedVersion)throw new Error("Warranty claim changed; refresh first");
  if(!["resolved","rejected"].includes(input.status))throw new Error("Invalid warranty resolution");
  const resolutionNotes=notes(input.resolutionNotes,"resolution notes");
  if(resolutionNotes.trim().length<3)throw new Error("Warranty resolution reason required");
  const updated=claimRecord({...prior,status:input.status,resolutionNotes,version:prior.version+1,
    updatedAt:nowISO()});
  claims.splice(i,1,updated);
  auditAction("service_warranty.claim_close","service_warranty_claim",updated.id,prior,updated);
  touchPersistence();
  return {...updated};
}
