/**
 * INV-005 — Windows Offline counted-lot worksheet.
 *
 * Physical count metadata is attached to existing expiry reminders and live
 * WMS locations. It is NOT a transaction stock ledger, an authorized checkout
 * reservation, or a substitute for server/SQLite atomic stock consumption.
 */
import { generateId, nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { isProductionMode } from "./runtime-mode";
import { touchPersistence } from "./autosave";
import { auditAction } from "./audit-actions";
import { getActiveBranch } from "./phase9-store";
import { exportBatchExpiryReminders, type BatchExpiryReminder } from "./batch-expiry-register";
import * as warehouseStore from "./warehouse-store";
import { planFefoLotAllocations, type TrackedLot } from "./tracked-inventory";

export interface LocalLotCount {
  readonly id: string;
  readonly branchId: string;
  readonly reminderId: string;
  readonly warehouseId: string;
  readonly locationId: string;
  readonly productId: string;
  readonly quantityMilli: number;
  readonly status: "active" | "blocked";
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface LocalLotFefoPick {
  readonly countId: string;
  readonly locationId: string;
  readonly batchCode: string;
  readonly expiresOn: string;
  readonly quantityMilli: number;
}
export interface LocalLotFefoWorksheet {
  readonly productId: string;
  readonly warehouseId: string;
  readonly asOfDate: string;
  readonly quantityMilli: number;
  readonly allocations: readonly LocalLotFefoPick[];
  readonly advisoryOnly: true;
}
const counts: LocalLotCount[]=[];
const MAX_COUNTS=10000;
function textField(v:unknown,name:string):string {
  if(typeof v!=="string"||!v.trim()||v.trim().length>128||v!==v.trim())throw new Error("Invalid "+name);
  return v;
}
function validDate(v:unknown):boolean{
  if(typeof v!=="string"||!/^20\d\d-\d\d-\d\d$/.test(v))return false;
  const d=new Date(v+"T00:00:00.000Z");
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
}
function qtyMilli(v:unknown):number {
  if(typeof v!=="number"||!Number.isSafeInteger(v)||v<=0)throw new Error("Lot counted quantity must be positive safe milli-units");
  return v;
}
function parseQty(raw:string):number {
  if(typeof raw!=="string"||raw.length>24||!/^\d+(?:\.\d{1,3})?$/.test(raw.trim())){
    throw new Error("Lot count requires a positive quantity with up to 3 decimals");
  }
  const milli=Math.round(Number(raw.trim())*1000);
  return qtyMilli(milli);
}
function validateRecord(obj:unknown):LocalLotCount {
  if(!obj||typeof obj!=="object"||Array.isArray(obj))throw new Error("Invalid lot count backup record");
  const x=obj as Record<string,unknown>;
  const fields=["id","branchId","reminderId","warehouseId","locationId","productId","quantityMilli","status","version","createdAt","updatedAt"];
  if(Object.keys(x).some(k=>!fields.includes(k)))throw new Error("Unknown lot count backup field");
  const id=textField(x.id,"count id");
  const branchId=textField(x.branchId,"branch id");
  const reminderId=textField(x.reminderId,"reminder id");
  const warehouseId=textField(x.warehouseId,"warehouse id");
  const locationId=textField(x.locationId,"location id");
  const productId=textField(x.productId,"product id");
  const quantityMilli=qtyMilli(x.quantityMilli);
  if(x.status!=="active"&&x.status!=="blocked")throw new Error("Invalid lot status");
  if(!Number.isSafeInteger(x.version)||Number(x.version)<1)throw new Error("Invalid lot revision");
  if(typeof x.createdAt!=="string"||typeof x.updatedAt!=="string"||
     !Number.isFinite(Date.parse(x.createdAt))||!Number.isFinite(Date.parse(x.updatedAt))||
     x.updatedAt<x.createdAt)throw new Error("Invalid lot timestamps");
  return {id,branchId,reminderId,warehouseId,locationId,productId,quantityMilli,
    status:x.status,version:x.version as number,createdAt:x.createdAt,updatedAt:x.updatedAt};
}
export function validateLocalLotCounts(input:unknown):LocalLotCount[] {
  if(input==null)return [];
  if(!Array.isArray(input)||input.length>MAX_COUNTS)throw new Error("Invalid local lot count backup");
  const ids=new Set<string>(),keys=new Set<string>();
  return input.map(item=>{
    const v=validateRecord(item),natural=JSON.stringify([v.reminderId,v.locationId]);
    if(ids.has(v.id)||keys.has(natural))throw new Error("Duplicate local lot identity");
    ids.add(v.id);keys.add(natural);return v;
  });
}
export function exportLocalLotCounts():LocalLotCount[]{return counts.map(c=>({...c}));}
export function hydrateLocalLotCounts(input:unknown):void {
  const next=validateLocalLotCounts(input);
  counts.splice(0,counts.length,...next);
}
function branch():string {
  const b=getActiveBranch();
  if(!b||!b.isActive||b.deletedAt)throw new Error("Active branch is required");
  return b.id;
}
function writable():void {
  const desktop=typeof window!=="undefined"&&Boolean((window as unknown as {minarvaDesktop?:unknown}).minarvaDesktop);
  if(isProductionMode()&&!desktop)throw new Error("Local lot counts require installed Windows SQLite storage");
}
function sourceFor(reminderId:string,branchId:string):BatchExpiryReminder {
  const reminder=exportBatchExpiryReminders().find(r=>r.id===reminderId&&r.branchId===branchId);
  if(!reminder)throw new Error("Batch expiry reference unavailable in active branch");
  return reminder;
}
function locationFor(reminder:BatchExpiryReminder,locationId:string){
  const location=warehouseStore.listWarehouseLocations(reminder.warehouseId)
    .find(l=>l.id===locationId&&l.isActive&&!l.deletedAt);
  if(!location)throw new Error("Location does not belong to registered batch warehouse");
  return location;
}
function stockCapacity(reminder:BatchExpiryReminder,locationId:string):number {
  locationFor(reminder,locationId);
  const position=warehouseStore.listWarehouseStock({locationId,productId:reminder.productId})
    .find(p=>p.warehouseId===reminder.warehouseId);
  if(!position||!Number.isFinite(position.onHand)||position.onHand<0)throw new Error("No verified allocated WMS stock at this location");
  const qty=Math.round(position.onHand*1000);
  if(!Number.isSafeInteger(qty)||qty<0)throw new Error("Unsafe WMS stock quantity");
  return qty;
}
function assertCapacity(candidate:LocalLotCount):void {
  const reference=sourceFor(candidate.reminderId,candidate.branchId);
  if(reference.warehouseId!==candidate.warehouseId||reference.productId!==candidate.productId) {
    throw new Error("Batch scope changed; recount required");
  }
  const capacity=stockCapacity(reference,candidate.locationId);
  const all=counts.filter(x=>x.id!==candidate.id&&x.branchId===candidate.branchId&&
    x.productId===candidate.productId&&x.locationId===candidate.locationId);
  let total=candidate.quantityMilli;
  for(const x of all)total+=x.quantityMilli;
  if(!Number.isSafeInteger(total)||total>capacity)throw new Error("Batch counts exceed allocated physical WMS location stock");
}
/** Human stocktake of one batch in one location; does not credit/debit live stock. */
export function saveLocalLotCount(input:{
  readonly reminderId:string;readonly locationId:string;readonly quantity:string;
  readonly status?:"active"|"blocked";readonly id?:string;readonly expectedVersion?:number;
}):LocalLotCount {
  assertPermission("inventory.adjust");writable();
  const branchId=branch();
  const reminder=sourceFor(textField(input.reminderId,"reminder id"),branchId);
  const locationId=textField(input.locationId,"location id");
  locationFor(reminder,locationId);
  const milli=parseQty(input.quantity),status=input.status??"active";
  if(status!=="active"&&status!=="blocked")throw new Error("Invalid lot status");
  const old=input.id?counts.find(x=>x.id===input.id&&x.branchId===branchId):undefined;
  if(input.id&&!old)throw new Error("Lot count not found in active branch");
  if(old&&(!Number.isSafeInteger(input.expectedVersion)||old.version!==input.expectedVersion)) {
    throw new Error("Lot count was modified; refresh before editing");
  }
  if(old&&(old.reminderId!==reminder.id||old.locationId!==locationId))throw new Error("Count identity cannot be reassigned");
  if(!old&&counts.length>=MAX_COUNTS)throw new Error("Local lot register capacity exceeded");
  if(!old&&counts.some(x=>x.reminderId===reminder.id&&x.locationId===locationId)) {
    throw new Error("Batch already counted in this location; edit existing count");
  }
  const now=nowISO();
  const entry:LocalLotCount={
    id:old?.id??generateId(),branchId,reminderId:reminder.id,
    warehouseId:reminder.warehouseId,locationId,productId:reminder.productId,
    quantityMilli:milli,status,version:(old?.version??0)+1,
    createdAt:old?.createdAt??now,updatedAt:now,
  };
  assertCapacity(entry);
  if(old){counts.splice(counts.indexOf(old),1,entry);}
  else counts.push(entry);
  auditAction("local-lot.count.save","local_lot_counts",entry.id,old??null,entry);
  touchPersistence();
  return {...entry};
}
export function deleteLocalLotCount(id:string,expectedVersion:number):boolean {
  assertPermission("inventory.adjust");writable();
  const branchId=branch(),idx=counts.findIndex(x=>x.id===id&&x.branchId===branchId);
  if(idx<0)return false;
  if(counts[idx].version!==expectedVersion)throw new Error("Lot count was modified; refresh before deleting");
  const [old]=counts.splice(idx,1);
  auditAction("local-lot.count.delete","local_lot_counts",old.id,old,null);
  touchPersistence();
  return true;
}
export function listLocalLotCounts():LocalLotCount[] {
  assertPermission("reports.view");
  const branchId=branch();
  return counts.filter(x=>x.branchId===branchId).map(x=>({...x}))
    .sort((a,b)=>a.warehouseId.localeCompare(b.warehouseId)||a.locationId.localeCompare(b.locationId)||a.id.localeCompare(b.id));
}
/** Strictly advisory: revalidate on-hand and expiry before suggesting any pick. */
export function planLocalLotFefo(input:{
 readonly warehouseId:string;readonly productId:string;readonly quantity:string;readonly asOfDate:string;
}):LocalLotFefoWorksheet {
  assertPermission("reports.view");
  const branchId=branch(),warehouseId=textField(input.warehouseId,"warehouse id");
  const productId=textField(input.productId,"product id");
  if(!validDate(input.asOfDate))throw new Error("Invalid FEFO business date");
  const quantityMilli=parseQty(input.quantity);
  const batchRefs=new Map(exportBatchExpiryReminders().filter(r=>r.branchId===branchId).map(r=>[r.id,r]));
  const scope=counts.filter(x=>x.branchId===branchId&&x.warehouseId===warehouseId&&x.productId===productId);
  if(!scope.length)throw new Error("No counted lots for this warehouse/product");
  const seenPositions=new Set<string>();
  for(const item of scope){
    const ref=batchRefs.get(item.reminderId);
    if(!ref||ref.warehouseId!==warehouseId||ref.productId!==productId){
      throw new Error("Batch reference changed; recount before FEFO planning");
    }
    if(!seenPositions.has(item.locationId)){
      seenPositions.add(item.locationId);
      // Recheck all original counts against current WMS physical allocation.
      const capacity=stockCapacity(ref,item.locationId);
      const used=scope.filter(x=>x.locationId===item.locationId).reduce((sum,x)=>sum+x.quantityMilli,0);
      if(!Number.isSafeInteger(used)||used>capacity)throw new Error("WMS stock changed: recount before FEFO planning");
    }
  }
  const lots:TrackedLot[]=scope.map(item=>{
    const ref=batchRefs.get(item.reminderId)!;
    return {
      id:item.id,orgId:branchId,productId,warehouseId,
      batchCode:ref.batchCode,expiresOn:ref.expiresOn,
      onHandMilli:item.quantityMilli,reservedMilli:0,status:item.status,
    };
  });
  const picks=planFefoLotAllocations({orgId:branchId,productId,warehouseId,
    asOfDate:input.asOfDate,quantityMilli,lots});
  return {
    productId,warehouseId,asOfDate:input.asOfDate,quantityMilli,advisoryOnly:true,
    allocations:picks.map(p=>{
      const counted=scope.find(c=>c.id===p.batchId)!;
      const ref=batchRefs.get(counted.reminderId)!;
      return {countId:p.batchId,locationId:counted.locationId,
        batchCode:ref.batchCode,expiresOn:ref.expiresOn,quantityMilli:p.quantityMilli};
    }),
  };
}
