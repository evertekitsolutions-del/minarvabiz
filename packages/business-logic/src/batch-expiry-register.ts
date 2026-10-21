/**
 * INV-006 — local-first warehouse batch expiry reminder register.
 * Open Mercato MIT expiry date helpers retained under vendor/open-mercato.
 *
 * Nonfinancial metadata only: does NOT represent an authoritative lot stock
 * ledger, verify quantity, stop sales, or sync across devices.
 * Desktop saves in the existing SQLite domain snapshot/backup.
 */
import { generateId, nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import { auditAction } from "./audit-actions";
import * as store from "./store";
import * as warehouseStore from "./warehouse-store";
import { getActiveBranch } from "./phase9-store";
import { startOfUtcDay, addUtcDays, EXPIRING_SOON_DAYS } from "./vendor/open-mercato/expiry";

export interface BatchExpiryReminder {
  readonly id: string;
  readonly branchId: string;
  readonly warehouseId: string;
  readonly productId: string;
  readonly batchCode: string;
  readonly expiresOn: string;
  readonly notes: string;
  readonly createdAt: string;
}
export type BatchExpiryStatus = "expired" | "expiring_soon" | "later";
export interface BatchExpiryReportRow extends BatchExpiryReminder {
  readonly status: BatchExpiryStatus;
  readonly daysRemaining: number;
  readonly productName: string;
  readonly warehouseName: string;
}
export interface BatchExpiryReport {
  readonly asOfDate: string;
  readonly expiringDays: number;
  readonly expiredCount: number;
  readonly expiringSoonCount: number;
  readonly rows: readonly BatchExpiryReportRow[];
  readonly csv: string;
}
const reminders: BatchExpiryReminder[]=[];
const MAX_ITEMS=10000;
function civil(s:unknown):Date {
  if(typeof s!=="string" || !/^20\d{2}-\d{2}-\d{2}$/.test(s))throw new Error("Expiry date must be YYYY-MM-DD");
  const d=new Date(s+"T00:00:00.000Z");
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw new Error("Invalid expiry calendar date");
  return startOfUtcDay(d);
}
function nonempty(s:unknown,label:string,max:number):string {
  if(typeof s!=="string"||!s.trim()||s.length>max)throw new Error("Invalid "+label);
  return s.trim();
}
function validTimestamp(v:unknown):boolean{
  return typeof v==="string" && /^20\d{2}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v));
}
function validateItem(candidate:unknown):BatchExpiryReminder {
  if(!candidate||typeof candidate!=="object"||Array.isArray(candidate))throw new Error("Invalid batch expiry reminder");
  const v=candidate as Record<string,unknown>;
  const allowed=new Set(["id","branchId","warehouseId","productId","batchCode","expiresOn","notes","createdAt"]);
  if(Object.keys(v).some(k=>!allowed.has(k)))throw new Error("Unknown expiry record field");
  const id=nonempty(v.id,"expiry id",128),branchId=nonempty(v.branchId,"branch id",128);
  const warehouseId=nonempty(v.warehouseId,"warehouse id",128);
  const productId=nonempty(v.productId,"product id",128);
  const batchCode=nonempty(v.batchCode,"batch code",64);
  if(/[\r\n]/.test(batchCode))throw new Error("Batch code must be a single line");
  civil(v.expiresOn);
  if(typeof v.notes!=="string"||v.notes.length>500)throw new Error("Expiry notes exceed 500 characters");
  if(!validTimestamp(v.createdAt))throw new Error("Invalid expiry record timestamp");
  return {id,branchId,warehouseId,productId,batchCode,
    expiresOn:v.expiresOn as string,notes:v.notes,createdAt:v.createdAt as string};
}
function key(r:Pick<BatchExpiryReminder,"branchId"|"warehouseId"|"productId"|"batchCode">):string {
  return JSON.stringify([r.branchId,r.warehouseId,r.productId,r.batchCode.toUpperCase()]);
}
export function validateBatchExpiryReminders(input:unknown):BatchExpiryReminder[]{
  if(input==null)return [];
  if(!Array.isArray(input)||input.length>MAX_ITEMS)throw new Error("Invalid batch expiry register");
  const ids=new Set<string>(),keys=new Set<string>();
  return input.map(raw=>{
    const row=validateItem(raw);
    if(ids.has(row.id)||keys.has(key(row)))throw new Error("Duplicate batch expiry reminder");
    ids.add(row.id);keys.add(key(row));return row;
  });
}
export function exportBatchExpiryReminders():BatchExpiryReminder[]{
  return reminders.map(r=>({...r}));
}
/** Backups restore atomically after validation in persistence.ts. */
export function hydrateBatchExpiryReminders(input:unknown):void {
  const incoming=validateBatchExpiryReminders(input);
  reminders.splice(0,reminders.length,...incoming);
}
function branchScope():string{
  const branch=getActiveBranch();
  if(!branch||!branch.isActive||branch.deletedAt)throw new Error("Select an active branch before editing expiry records");
  return branch.id;
}
export function listBatchExpiryReminders():BatchExpiryReminder[]{
  assertPermission("reports.view");
  const branchId=branchScope();
  return reminders.filter(r=>r.branchId===branchId).map(r=>({...r}))
    .sort((a,b)=>a.expiresOn.localeCompare(b.expiresOn)||a.batchCode.localeCompare(b.batchCode));
}
export function createBatchExpiryReminder(input:{
  readonly warehouseId:string;readonly productId:string;readonly batchCode:string;
  readonly expiresOn:string;readonly notes?:string;
}):BatchExpiryReminder {
  assertPermission("inventory.adjust");
  const branchId=branchScope();
  const warehouseId=nonempty(input.warehouseId,"warehouse id",128);
  const productId=nonempty(input.productId,"product id",128);
  const warehouse=warehouseStore.listWarehouses().find(w=>w.id===warehouseId && w.isActive && !w.deletedAt);
  const product=store.getProduct(productId);
  if(!warehouse||(warehouse.branchId!=null&&warehouse.branchId!==branchId)||
    !product||!product.isActive||product.deletedAt||
    (product.branchId!=null&&product.branchId!==branchId)) {
    throw new Error("Warehouse/product unavailable in active branch");
  }
  const batchCode=nonempty(input.batchCode,"batch code",64);
  if(/[\r\n]/.test(batchCode))throw new Error("Batch code must be a single line");
  civil(input.expiresOn);
  const notes=(input.notes??"").trim();
  if(notes.length>500)throw new Error("Expiry notes exceed 500 characters");
  if(reminders.length>=MAX_ITEMS)throw new Error("Expiry register capacity exceeded");
  const stamp=nowISO();
  const entry=validateItem({id:generateId(),branchId,warehouseId,productId,
    batchCode,expiresOn:input.expiresOn,notes,createdAt:stamp});
  if(reminders.some(row=>key(row)===key(entry)))throw new Error("Batch already registered for this product/warehouse");
  reminders.push(entry);
  auditAction("batch-expiry.create","batch_expiry_reminders",entry.id,null,entry);
  touchPersistence();
  return {...entry};
}
/** Removes metadata only; never deletes a real stock lot or its transactions. */
export function removeBatchExpiryReminder(id:string):boolean{
  assertPermission("inventory.adjust");
  const branchId=branchScope();
  const index=reminders.findIndex(r=>r.id===id&&r.branchId===branchId);
  if(index<0)return false;
  const [prior]=reminders.splice(index,1);
  auditAction("batch-expiry.remove","batch_expiry_reminders",id,prior,null);
  touchPersistence();
  return true;
}
function csvCell(v:string|number):string{
  const raw=String(v),safe=/^[\s\uFEFF]*[=+\-@\t\r]/u.test(raw)?"'"+raw:raw;
  return '"'+safe.replace(/"/g,'""')+'"';
}
/** Returns all locally recorded reminders; no claim that lot stock is live. */
export function buildBatchExpiryReport(asOfDate:string):BatchExpiryReport {
  assertPermission("reports.view");
  const today=civil(asOfDate);
  // Reuse the exact Open Mercato inventory WMS expiring window convention.
  const deadline=addUtcDays(today,EXPIRING_SOON_DAYS);
  const branchId=branchScope();
  const eligible=reminders.filter(r=>r.branchId===branchId);
  const products=new Map(store.listProducts().map(p=>[p.id,p]));
  const warehouses=new Map(warehouseStore.listWarehouses(true).map(w=>[w.id,w]));
  const rows=eligible.map(row=>{
    const at=civil(row.expiresOn);
    const daysRemaining=Math.round((at.getTime()-today.getTime())/86400000);
    const status:BatchExpiryStatus=at.getTime()<today.getTime()?"expired":at.getTime()<=deadline.getTime()?"expiring_soon":"later";
    return {
      ...row,status,daysRemaining,
      productName:products.get(row.productId)?.name??"[Removed product]",
      warehouseName:warehouses.get(row.warehouseId)?.name??"[Removed warehouse]",
    };
  }).sort((a,b)=>a.expiresOn.localeCompare(b.expiresOn)||a.batchCode.localeCompare(b.batchCode));
  const csv=[
    ["Product","Warehouse","Batch","Expires on","Days remaining","Expiry status","Notes"],
    ...rows.map(r=>[r.productName,r.warehouseName,r.batchCode,r.expiresOn,
      String(r.daysRemaining),r.status,r.notes]),
  ].map(cells=>cells.map(csvCell).join(",")).join("\r\n")+"\r\n";
  return {asOfDate,expiringDays:EXPIRING_SOON_DAYS,
    expiredCount:rows.filter(r=>r.status==="expired").length,
    expiringSoonCount:rows.filter(r=>r.status==="expiring_soon").length,rows,csv};
}
