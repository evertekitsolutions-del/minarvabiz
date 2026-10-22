/**
 * INV-007 — locally persisted per-item serial/IMEI custody register.
 *
 * Serialized stock is manual metadata, not authoritative sale/GRN posting.
 * Hosted production Web writes are disabled until tenant-safe sync exists.
 */
import { generateId, nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { isProductionMode } from "./runtime-mode";
import { auditAction } from "./audit-actions";
import { touchPersistence } from "./autosave";
import { getActiveBranch } from "./phase9-store";
import * as warehouseStore from "./warehouse-store";
import * as store from "./store";

export type SerialCustodyStatus = "in_stock" | "sold" | "service" | "retired";
export interface SerialCustodyRecord {
  readonly id: string;
  readonly branchId: string;
  readonly productId: string;
  readonly warehouseId: string;
  readonly locationId: string;
  readonly serialNumber: string;
  readonly status: SerialCustodyStatus;
  /** Manual reference only. Never evidence of a posted invoice. */
  readonly reference: string;
  readonly notes: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface SerialCustodyReportRow extends SerialCustodyRecord {
  readonly productName: string;
  readonly warehouseName: string;
  readonly locationName: string;
}
export interface SerialCustodyReport {
  readonly rows: readonly SerialCustodyReportRow[];
  readonly csv: string;
  readonly total: number;
  readonly onHand: number;
  readonly sold: number;
  readonly service: number;
  readonly retired: number;
}

const records: SerialCustodyRecord[] = [];
const MAX_RECORDS = 10000;
const STATUS: readonly SerialCustodyStatus[] = ["in_stock","sold","service","retired"];
function field(value: unknown, name: string, max = 128): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || value.trim() !== value ||
      /[\r\n\t\u0000-\u001f]/.test(value)) throw new Error("Invalid " + name);
  return value;
}
function memo(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    throw new Error("Invalid " + name);
  }
  return value;
}
function normalizeSerial(value: unknown): string {
  const serial = field(value,"serial number",100);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:\/-]*$/.test(serial)) {
    throw new Error("Serial/IMEI may contain letters, digits, hyphens, dots, colons or slashes");
  }
  return serial;
}
function key(value: string): string { return value.toUpperCase(); }
function isStamp(value: unknown): value is string {
  return typeof value === "string" && /^20\d{2}-\d{2}-\d{2}T/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function validate(raw: unknown): SerialCustodyRecord {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid serial backup record");
  const x = raw as Record<string,unknown>;
  const keys = ["id","branchId","productId","warehouseId","locationId","serialNumber","status",
    "reference","notes","version","createdAt","updatedAt"];
  if (Object.keys(x).some(k=>!keys.includes(k))) throw new Error("Unknown serial record field");
  const id=field(x.id,"serial record id"), branchId=field(x.branchId,"branch id");
  const productId=field(x.productId,"product id"), warehouseId=field(x.warehouseId,"warehouse id");
  const locationId=field(x.locationId,"location id"), serialNumber=normalizeSerial(x.serialNumber);
  if (!STATUS.includes(x.status as SerialCustodyStatus)) throw new Error("Invalid serial custody status");
  if (!Number.isSafeInteger(x.version) || Number(x.version) < 1) throw new Error("Invalid serial record revision");
  if (!isStamp(x.createdAt) || !isStamp(x.updatedAt) || x.updatedAt < x.createdAt) {
    throw new Error("Invalid serial custody timestamps");
  }
  const reference=memo(x.reference,"custody reference",120);
  const notes=memo(x.notes,"custody notes",500);
  if (x.status==="sold" && !reference.trim()) throw new Error("Manual sold status requires a reference");
  return {id,branchId,productId,warehouseId,locationId,serialNumber,
    status:x.status as SerialCustodyStatus,reference,notes,
    version:x.version as number,createdAt:x.createdAt as string,updatedAt:x.updatedAt as string};
}
export function validateSerialCustodyRecords(input:unknown):SerialCustodyRecord[] {
  if (input==null) return [];
  if (!Array.isArray(input) || input.length>MAX_RECORDS) throw new Error("Invalid serial custody backup");
  const serials=new Set<string>(), ids=new Set<string>();
  return input.map(raw=>{
    const record=validate(raw), serialKey=key(record.serialNumber);
    if (serials.has(serialKey) || ids.has(record.id)) throw new Error("Duplicate serial number or identity in backup");
    ids.add(record.id);serials.add(serialKey);return record;
  });
}
export function exportSerialCustodyRecords():SerialCustodyRecord[] {
  return records.map(x=>({...x}));
}
export function hydrateSerialCustodyRecords(input:unknown):void {
  const validated=validateSerialCustodyRecords(input);
  records.splice(0,records.length,...validated);
}
function branch():string {
  const active=getActiveBranch();
  if (!active||!active.isActive||active.deletedAt) throw new Error("Choose an active branch");
  return active.id;
}
function writable():void {
  const desktop=typeof window!=="undefined" &&
    Boolean((window as unknown as {minarvaDesktop?:unknown}).minarvaDesktop);
  if (isProductionMode() && !desktop) {
    throw new Error("Serial registry editing requires installed Windows local SQLite storage");
  }
}
function verifyPosition(branchId:string,productId:string,warehouseId:string,locationId:string):void {
  const product=store.getProduct(productId);
  if (!product||!product.isActive||product.deletedAt ||
    (product.branchId!=null&&product.branchId!==branchId)) {
    throw new Error("Product unavailable in active branch");
  }
  const wh=warehouseStore.listWarehouses(true).find(w=>w.id===warehouseId && w.isActive && !w.deletedAt);
  const loc=warehouseStore.listWarehouseLocations(warehouseId).find(l=>l.id===locationId && l.isActive && !l.deletedAt);
  if (!wh||!loc||(wh.branchId!=null&&wh.branchId!==branchId)) {
    throw new Error("Warehouse/bin unavailable in active branch");
  }
}
function cap(record:SerialCustodyRecord):void {
  if(record.status!=="in_stock") return;
  const p=warehouseStore.listWarehouseStock({locationId:record.locationId,productId:record.productId})
    .find(x=>x.warehouseId===record.warehouseId);
  if (!p || !Number.isFinite(p.onHand) || p.onHand<0) {
    throw new Error("Allocate physical warehouse stock before registering in-stock serials");
  }
  const available=Math.floor(p.onHand+1e-9);
  const counted=records.filter(x=>x.id!==record.id && x.status==="in_stock" &&
      x.branchId===record.branchId && x.warehouseId===record.warehouseId &&
      x.locationId===record.locationId && x.productId===record.productId).length;
  if (counted+1>available) {
    throw new Error("In-stock serial count exceeds allocated warehouse product quantity");
  }
}
export function createSerialCustodyRecord(input:{
  readonly productId:string;readonly warehouseId:string;readonly locationId:string;
  readonly serialNumber:string;readonly notes?:string;
}):SerialCustodyRecord {
  assertPermission("inventory.adjust");writable();
  const branchId=branch();
  const productId=field(input.productId,"product id");
  const warehouseId=field(input.warehouseId,"warehouse id");
  const locationId=field(input.locationId,"location id");
  const serialNumber=normalizeSerial(input.serialNumber);
  verifyPosition(branchId,productId,warehouseId,locationId);
  if(records.length>=MAX_RECORDS)throw new Error("Serial registry limit exceeded");
  if(records.some(x=>key(x.serialNumber)===key(serialNumber))){
    throw new Error("Serial number already exists in this local company register");
  }
  const stamp=nowISO();
  const r=validate({id:generateId(),branchId,productId,warehouseId,locationId,
    serialNumber,status:"in_stock",reference:"",notes:input.notes??"",
    version:1,createdAt:stamp,updatedAt:stamp});
  cap(r); records.push(r);
  auditAction("serial-custody.create","serial_custody_records",r.id,null,r);
  touchPersistence();
  return {...r};
}
export function updateSerialCustodyRecord(input:{
  readonly id:string;readonly expectedVersion:number;
  readonly status:SerialCustodyStatus;readonly reference?:string;readonly notes?:string;
}):SerialCustodyRecord {
  assertPermission("inventory.adjust");writable();
  const branchId=branch();
  const old=records.find(x=>x.id===input.id&&x.branchId===branchId);
  if(!old)throw new Error("Serial record unavailable in active branch");
  if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion!==old.version){
    throw new Error("Serial record changed; refresh before editing");
  }
  verifyPosition(branchId,old.productId,old.warehouseId,old.locationId);
  // Status is a custody note, not an authoritative invoice/return mutation.
  // Retired items cannot be silently put back into a physical sales shelf.
  if(old.status==="retired"&&input.status!=="retired"){
    throw new Error("Retired serial custody cannot be reopened without stock adjustment");
  }
  const fresh=validate({...old,status:input.status,reference:input.reference??"",
    notes:input.notes??old.notes,version:old.version+1,updatedAt:nowISO()});
  cap(fresh);
  records.splice(records.indexOf(old),1,fresh);
  auditAction("serial-custody.update","serial_custody_records",old.id,old,fresh);
  touchPersistence();
  return {...fresh};
}
export function listSerialCustodyRecords():SerialCustodyRecord[]{
  assertPermission("reports.view");
  const branchId=branch();
  return records.filter(x=>x.branchId===branchId).map(x=>({...x}))
    .sort((a,b)=>a.serialNumber.localeCompare(b.serialNumber));
}
function safeCsv(value:string):string {
  const escaped=/^[\s\uFEFF]*[=+\-@\t\r]/u.test(value)?"'"+value:value;
  return '"'+escaped.replace(/"/g,'""')+'"';
}
export function buildSerialCustodyReport(search=""):SerialCustodyReport{
  assertPermission("reports.view");
  const needle=String(search).trim().toUpperCase();
  if(needle.length>100)throw new Error("Serial search is too long");
  const rows=listSerialCustodyRecords().filter(x=>
    !needle||key(x.serialNumber).includes(needle)||key(x.reference).includes(needle)).map(x=>{
      const p=store.getProduct(x.productId);
      const wh=warehouseStore.listWarehouses(true).find(w=>w.id===x.warehouseId);
      const loc=warehouseStore.listWarehouseLocations(x.warehouseId).find(l=>l.id===x.locationId);
      return {...x,productName:p?.name??"[Removed product]",
        warehouseName:wh?.name??"[Removed warehouse]",locationName:loc?.code??"[Removed location]"};
    });
  const cols=["Serial","Product","Warehouse","Bin","Status","Manual reference","Notes","Version"];
  const csv=[cols,...rows.map(x=>[x.serialNumber,x.productName,x.warehouseName,
    x.locationName,x.status,x.reference,x.notes,String(x.version)])]
    .map(row=>row.map(safeCsv).join(",")).join("\r\n")+"\r\n";
  return {rows,csv,total:rows.length,onHand:rows.filter(x=>x.status==="in_stock").length,
    sold:rows.filter(x=>x.status==="sold").length,
    service:rows.filter(x=>x.status==="service").length,
    retired:rows.filter(x=>x.status==="retired").length};
}
