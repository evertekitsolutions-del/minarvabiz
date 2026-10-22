/**
 * PUR-004/INV-005: durable offline Goods Receipt batch attribution.
 *
 * Physical goods receipt and Product stock were already posted by Procurement.
 * This is a separate evidence/trace register, never a second stock receipt,
 * not an authoritative lot quantity or a sale-time stock interlock.
 */
import { generateId, nowISO, toQuantityMilli } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { isProductionMode } from "./runtime-mode";
import { getActiveBranch } from "./phase9-store";
import { getGoodsReceipt } from "./procurement-store";
import { touchPersistence } from "./autosave";
import { auditAction } from "./audit-actions";
import type { GoodsReceipt, GoodsReceiptLine } from "@minarvabiz/types";

export interface GrnBatchAttribution {
  readonly id: string;
  readonly branchId: string;
  readonly goodsReceiptId: string;
  readonly goodsReceiptLineId: string;
  readonly productId: string;
  readonly warehouseLocationId: string | null;
  readonly batchCode: string;
  readonly expiryDate: string;
  readonly quantityMilli: number;
  readonly receivedDate: string;
  readonly voidedAt: string | null;
  readonly voidReason: string | null;
  readonly createdAt: string;
  readonly version: number;
}
export interface GrnBatchCoverageLine {
  readonly goodsReceiptId: string;
  readonly goodsReceiptLineId: string;
  readonly grnNumber: string;
  readonly productId: string;
  readonly receivedMilli: number;
  readonly attributedMilli: number;
  readonly unattributedMilli: number;
  readonly fullyAttributed: boolean;
}
const rows:GrnBatchAttribution[]=[];
const MAX_BATCH_ROWS=20000;
function required(value:unknown,label:string,max=128):string {
  if(typeof value!=="string"||!value.trim()||value.length>max||value.trim()!==value||
     /[\u0000-\u001f]/.test(value))throw new Error("Invalid "+label);
  return value;
}
function day(value:unknown):string {
  if(typeof value!=="string"||!/^20\d{2}-\d{2}-\d{2}$/.test(value)){
    throw new Error("Batch expiry date must be YYYY-MM-DD");
  }
  const date=new Date(value+"T00:00:00.000Z");
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value){
    throw new Error("Invalid expiry calendar date");
  }
  return value;
}
function positiveMilli(value:unknown):number {
  if(typeof value!=="number"||!Number.isSafeInteger(value)||value<=0){
    throw new Error("Invalid positive batch quantity milli-units");
  }
  return value;
}
function parseQuantity(value:string):number {
  if(typeof value!=="string"||value.length>30||!/^\d+(?:\.\d{1,3})?$/.test(value)){
    throw new Error("Batch quantity requires a positive decimal with up to 3 digits of precision");
  }
  return positiveMilli(toQuantityMilli(Number(value)));
}
function timestamp(value:unknown):string {
  if(typeof value!=="string"||!/^20\d\d-\d\d-\d\dT/.test(value)||
     !Number.isFinite(Date.parse(value)))throw new Error("Invalid batch attribution timestamp");
  return value;
}
function validate(row:unknown):GrnBatchAttribution {
  if(!row||typeof row!=="object"||Array.isArray(row))throw new Error("Invalid GRN batch attribution record");
  const x=row as Record<string,unknown>;
  const fields=["id","branchId","goodsReceiptId","goodsReceiptLineId","productId","warehouseLocationId",
    "batchCode","expiryDate","quantityMilli","receivedDate","voidedAt","voidReason","createdAt","version"];
  if(Object.keys(x).some(k=>!fields.includes(k)))throw new Error("Unknown GRN batch attribution field");
  const id=required(x.id,"batch record id"),
    branchId=required(x.branchId,"branch id"),
    goodsReceiptId=required(x.goodsReceiptId,"goods receipt id"),
    goodsReceiptLineId=required(x.goodsReceiptLineId,"receipt line id"),
    productId=required(x.productId,"product id"),
    batchCode=required(x.batchCode,"batch code",64);
  const warehouseLocationId=x.warehouseLocationId===null?null:required(x.warehouseLocationId,"warehouse location id");
  const expiryDate=day(x.expiryDate),receivedDate=day(x.receivedDate);
  const quantityMilli=positiveMilli(x.quantityMilli);
  if(!Number.isSafeInteger(x.version)||Number(x.version)<1)throw new Error("Invalid batch attribution version");
  const createdAt=timestamp(x.createdAt);
  const voidedAt=x.voidedAt===null?null:timestamp(x.voidedAt);
  const voidReason=x.voidReason===null?null:required(x.voidReason,"void reason",250);
  if(Boolean(voidedAt)!==Boolean(voidReason))throw new Error("Voided batch must include both timestamp and reason");
  return {id,branchId,goodsReceiptId,goodsReceiptLineId,productId,warehouseLocationId,
    batchCode,expiryDate,quantityMilli,receivedDate,voidedAt,voidReason,createdAt,version:x.version as number};
}
function naturalKey(x:GrnBatchAttribution):string {
  return JSON.stringify([x.branchId,x.goodsReceiptLineId,x.batchCode.toUpperCase()]);
}
export function validateGrnBatchAttributions(input:unknown):GrnBatchAttribution[] {
  if(input==null)return [];
  if(!Array.isArray(input)||input.length>MAX_BATCH_ROWS)throw new Error("Invalid GRN batch attribution backup");
  const ids=new Set<string>(),names=new Set<string>();
  return input.map(x=>{
    const item=validate(x),natural=naturalKey(item);
    if(ids.has(item.id)||names.has(natural))throw new Error("Duplicate GRN batch attribution identity");
    ids.add(item.id);names.add(natural);
    return item;
  });
}
export function exportGrnBatchAttributions():GrnBatchAttribution[]{
  return rows.map(row=>({...row}));
}
export function hydrateGrnBatchAttributions(input:unknown):void {
  const incoming=validateGrnBatchAttributions(input);
  rows.splice(0,rows.length,...incoming);
}
function branchId():string {
  const branch=getActiveBranch();
  if(!branch||!branch.isActive||branch.deletedAt)throw new Error("Select an active branch");
  return branch.id;
}
function ensureOffline():void {
  const desktop=typeof window!=="undefined"&&
    Boolean((window as unknown as {minarvaDesktop?:unknown}).minarvaDesktop);
  if(isProductionMode()&&!desktop){
    throw new Error("GRN batch attribution requires installed Windows SQLite storage");
  }
}
function sourceLine(grnId:string,lineId:string,branch:string):{receipt:GoodsReceipt;line:GoodsReceiptLine} {
  const receipt=getGoodsReceipt(grnId);
  if(!receipt||(receipt.branchId!=null&&receipt.branchId!==branch)){
    throw new Error("Goods receipt unavailable in the active branch");
  }
  const line=receipt.lines.find(x=>x.id===lineId);
  if(!line||!line.productId||line.receivedQuantity<=0||!Number.isFinite(line.receivedQuantity)){
    throw new Error("Goods receipt line is not a tracked product quantity");
  }
  return {receipt,line};
}
/** Adds provenance for an already posted GRN line, without moving any stock. */
export function recordGrnBatchAttribution(input:{
  readonly goodsReceiptId:string;
  readonly goodsReceiptLineId:string;
  readonly batchCode:string;
  readonly expiryDate:string;
  readonly quantity:string;
}):GrnBatchAttribution {
  assertPermission("purchases.manage");ensureOffline();
  const branch=branchId(),receiptId=required(input.goodsReceiptId,"goods receipt id"),
    lineId=required(input.goodsReceiptLineId,"goods receipt line id");
  const batchCode=required(input.batchCode,"batch code",64);
  const expiryDate=day(input.expiryDate),quantityMilli=parseQuantity(input.quantity);
  const {receipt,line}=sourceLine(receiptId,lineId,branch);
  if(rows.length>=MAX_BATCH_ROWS)throw new Error("Batch attribution limit reached");
  const receivedMilli=positiveMilli(toQuantityMilli(line.receivedQuantity));
  const already=rows.filter(x=>x.branchId===branch&&x.goodsReceiptLineId===line.id&&!x.voidedAt)
    .reduce((sum,x)=>sum+BigInt(x.quantityMilli),0n);
  if(already+BigInt(quantityMilli)>BigInt(receivedMilli)){
    throw new Error("Batch quantities cannot exceed the posted GRN line quantity");
  }
  const now=nowISO();
  const candidate=validate({
    id:generateId(),branchId:branch,goodsReceiptId:receipt.id,
    goodsReceiptLineId:line.id,productId:line.productId,
    warehouseLocationId:line.warehouseLocationId??null,
    batchCode,expiryDate,quantityMilli,receivedDate:day(receipt.receiptDate),
    voidedAt:null,voidReason:null,createdAt:now,version:1,
  });
  if(rows.some(x=>naturalKey(x)===naturalKey(candidate))){
    throw new Error("This GRN line already has the same batch code");
  }
  rows.push(candidate);
  auditAction("grn.batch-attribution.create","grn_batch_attributions",candidate.id,null,candidate);
  touchPersistence();
  return {...candidate};
}
/** Voids a mistaken attribution with a mandatory reason; never reverses GRN stock. */
export function voidGrnBatchAttribution(id:string,version:number,reason:string):GrnBatchAttribution {
  assertPermission("purchases.manage");ensureOffline();
  const branch=branchId(),note=required(reason,"void reason",250);
  const index=rows.findIndex(x=>x.id===id&&x.branchId===branch);
  if(index<0)throw new Error("GRN batch attribution unavailable in active branch");
  const prior=rows[index];
  if(prior.voidedAt)throw new Error("GRN batch attribution already voided");
  if(!Number.isSafeInteger(version)||version!==prior.version)throw new Error("Stale attribution version");
  const updated=validate({...prior,voidedAt:nowISO(),voidReason:note,version:prior.version+1});
  rows.splice(index,1,updated);
  auditAction("grn.batch-attribution.void","grn_batch_attributions",id,prior,updated);
  touchPersistence();
  return {...updated};
}
export function listGrnBatchAttributions(grnId?:string):GrnBatchAttribution[] {
  assertPermission("reports.view");
  const branch=branchId();
  return rows.filter(x=>x.branchId===branch&&(!grnId||x.goodsReceiptId===grnId))
    .map(x=>({...x})).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
}
export function grnBatchCoverage(grnId:string):GrnBatchCoverageLine[] {
  assertPermission("reports.view");
  const branch=branchId(),{receipt}=sourceLineForReport(grnId,branch);
  return receipt.lines.filter(line=>line.productId!=null&&line.receivedQuantity>0).map(line=>{
    const receivedMilli=positiveMilli(toQuantityMilli(line.receivedQuantity));
    const total=rows.filter(x=>!x.voidedAt&&x.branchId===branch&&x.goodsReceiptLineId===line.id)
      .reduce((sum,x)=>sum+BigInt(x.quantityMilli),0n);
    if(total>BigInt(receivedMilli))throw new Error("Recorded batches exceed original posted GRN quantity");
    return {goodsReceiptId:receipt.id,goodsReceiptLineId:line.id,
      grnNumber:receipt.grnNumber,productId:line.productId!,
      receivedMilli,attributedMilli:Number(total),
      unattributedMilli:receivedMilli-Number(total),
      fullyAttributed:total===BigInt(receivedMilli)};
  });
}
function sourceLineForReport(grnId:string,branch:string):{receipt:GoodsReceipt} {
  const receipt=getGoodsReceipt(grnId);
  if(!receipt||(receipt.branchId!=null&&receipt.branchId!==branch)) {
    throw new Error("Goods receipt unavailable in active branch");
  }
  return {receipt};
}
