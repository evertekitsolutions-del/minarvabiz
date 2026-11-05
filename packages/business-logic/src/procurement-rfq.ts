/**
 * PUR-002: persistent local RFQ -> supplier offers -> comparative award -> draft PO.
 * Reuses Open Mercato's MIT price parser and Minarva's authoritative PO engine.
 * No automatic emails, stock posting, AP or supplier payments occur here.
 */
import type { Product, PurchaseOrder, Supplier } from "@minarvabiz/types";
import { addMinorUnits, fromMinorUnits, generateId, multiplyMinorByQuantity, nowISO, percentOfMinor, toMinorUnits } from "@minarvabiz/utils";
import { validateCatalogPriceAmountInput } from "./vendor/open-mercato/priceValidation";
import { buildRfqDraftPreview, type RfqDraftInput } from "./rfq-draft-preview";
import { assertPermission } from "./permissions";
import { auditAction } from "./audit-actions";
import { touchPersistence } from "./autosave";
import * as store from "./store";
import * as phase5 from "./phase5-store";
import * as phase9 from "./phase9-store";
import * as procurement from "./procurement-store";

export type RfqLifecycleStatus = "draft" | "issued" | "awarded" | "cancelled";
export interface RfqProductLine {
  productId: string; description: string; sku: string; unit: string; quantity: number;
}
export interface RfqQuoteLine {
  productId: string; unitCost: number; taxRate: number;
}
export interface RfqSupplierQuote {
  supplierId: string; quoteReference: string; validUntil: string;
  lines: RfqQuoteLine[]; subtotal: number; taxAmount: number; total: number;
  recordedAt: string;
}
export interface ProcurementRfq {
  id: string; reference: string; requiredBy: string; notes: string;
  branchId: string | null; status: RfqLifecycleStatus;
  supplierIds: string[]; lines: RfqProductLine[];
  quotes: RfqSupplierQuote[]; awardedSupplierId: string | null; purchaseOrderId: string | null;
  createdAt: string; updatedAt: string; version: number;
}
export interface RfqSupplierQuoteDraft {
  supplierId: string; quoteReference: string; validUntil: string;
  lines: ReadonlyArray<{ productId: string; unitCost: string; taxRate: string }>;
}

const records: ProcurementRfq[] = [];
const validStatuses = new Set<RfqLifecycleStatus>(["draft","issued","awarded","cancelled"]);
const today = () => new Date().toISOString().slice(0,10);
const activeBranch = () => phase9.getActiveBranch()?.id ?? null;
function clone(record: ProcurementRfq): ProcurementRfq {
  return { ...record, supplierIds: [...record.supplierIds], lines: record.lines.map(l => ({...l})),
    quotes: record.quotes.map(q => ({...q, lines:q.lines.map(l=>({...l}))})) };
}
function requireScopedRecord(id: string): ProcurementRfq {
  const found = records.find(r=>r.id===id && r.branchId===activeBranch());
  if (!found) throw new Error("RFQ missing or outside the active branch");
  return found;
}
function revision(record: ProcurementRfq, expected: number) {
  if (!Number.isSafeInteger(expected) || expected < 1 || record.version !== expected ||
      record.version >= Number.MAX_SAFE_INTEGER) throw new Error("RFQ has changed: refresh before editing");
}
function exactDay(value: string): string {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) throw new Error("Use a valid YYYY-MM-DD date");
  const stamp = new Date(value+"T00:00:00.000Z");
  if (!Number.isFinite(stamp.getTime()) || stamp.toISOString().slice(0,10)!==value) throw new Error("Invalid date");
  return value;
}
function currentSupplier(id: string): Supplier {
  const s = phase5.getSupplier(id);
  if (!s || s.deletedAt || (s.branchId != null && s.branchId !== activeBranch())) {
    throw new Error("Supplier is unavailable in this branch");
  }
  return s;
}
function currentProduct(id: string): Product {
  const p = store.getProduct(id);
  if (!p || !p.isActive || p.deletedAt || (p.branchId != null && p.branchId !== activeBranch())) {
    throw new Error("Product is unavailable in this branch");
  }
  return p;
}
/** Upstream accepts four decimals for catalog; financial PO inputs must be exact cents. */
function money(raw: string): number {
  const parsed = validateCatalogPriceAmountInput(raw);
  if (!parsed.ok || typeof raw !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) {
    throw new Error("Supplier unit costs require a nonnegative amount with at most 2 decimals");
  }
  return fromMinorUnits(toMinorUnits(parsed.numeric));
}
function taxRate(raw: string): number {
  if (typeof raw !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) {
    throw new Error("Supplier tax percentage requires at most 2 decimals");
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("Supplier tax must be 0–100%");
  return n;
}
function copyList(): ProcurementRfq[] {
  return records.map(clone);
}
export function listProcurementRfqs(): ProcurementRfq[] {
  assertPermission("purchases.manage");
  return records.filter(r=>r.branchId===activeBranch()).map(clone).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export function getProcurementRfq(id:string): ProcurementRfq {
  assertPermission("purchases.manage");
  return clone(requireScopedRecord(id));
}
export function createProcurementRfq(input: RfqDraftInput): ProcurementRfq {
  assertPermission("purchases.manage");
  const branchId = activeBranch();
  const preview = buildRfqDraftPreview(input, store.listProducts(), phase5.listSuppliers(), branchId);
  if (records.some(r=>r.branchId===branchId && r.reference===preview.reference && r.status!=="cancelled")) {
    throw new Error("RFQ reference already exists in this branch");
  }
  const seen = new Set<string>();
  const lines: RfqProductLine[] = [];
  for (const row of preview.rows) {
    if (seen.has(row.productId)) continue;
    seen.add(row.productId);
    lines.push({productId:row.productId, description:row.productName,
      sku:row.sku, unit:row.unit, quantity:row.quantity});
  }
  const now=nowISO();
  const record: ProcurementRfq = {
    id:generateId(),reference:preview.reference,requiredBy:preview.requiredBy,
    notes:(input.notes??"").trim(),branchId,status:"draft",
    supplierIds:[...input.supplierIds],lines,quotes:[],
    awardedSupplierId:null,purchaseOrderId:null,createdAt:now,updatedAt:now,version:1
  };
  records.push(record);
  auditAction("procurement.rfq.create","procurement_rfqs",record.id,null,clone(record));
  touchPersistence();
  return clone(record);
}
export function issueProcurementRfq(id:string,expectedVersion:number): ProcurementRfq {
  assertPermission("purchases.manage");
  const r=requireScopedRecord(id); revision(r,expectedVersion);
  if(r.status!=="draft") throw new Error("Only draft RFQs can be issued");
  for(const id of r.supplierIds) currentSupplier(id);
  for(const line of r.lines) currentProduct(line.productId);
  const before=clone(r);
  r.status="issued"; r.updatedAt=nowISO();r.version++;
  auditAction("procurement.rfq.issue","procurement_rfqs",id,before,clone(r));
  touchPersistence(); return clone(r);
}
export function recordProcurementRfqQuote(id:string,expectedVersion:number,input:RfqSupplierQuoteDraft): ProcurementRfq {
  assertPermission("purchases.manage");
  const r=requireScopedRecord(id);revision(r,expectedVersion);
  if(r.status!=="issued") throw new Error("Only issued RFQs accept supplier quotations");
  if(!r.supplierIds.includes(input.supplierId))throw new Error("Quote supplier was not included in RFQ");
  currentSupplier(input.supplierId);
  if(typeof input.quoteReference!=="string"||input.quoteReference.trim().length<1||
     input.quoteReference.trim().length>128||/[\r\n]/.test(input.quoteReference))throw new Error("Invalid supplier quotation reference");
  const validUntil=exactDay(input.validUntil);
  if(!Array.isArray(input.lines)||input.lines.length!==r.lines.length)throw new Error("Supplier quote must cover all requested products");
  const source=new Map(r.lines.map(x=>[x.productId,x]));
  const used=new Set<string>();
  const lines:RfqQuoteLine[]=[]; let subtotalMinor=0,taxMinor=0;
  for(const line of input.lines){
    if(!line||used.has(line.productId)||!source.has(line.productId))throw new Error("Missing or duplicate quote product");
    used.add(line.productId);
    const cost=money(line.unitCost),rate=taxRate(line.taxRate);
    const base=multiplyMinorByQuantity(toMinorUnits(cost),source.get(line.productId)!.quantity);
    const tax=percentOfMinor(base,rate);
    subtotalMinor=addMinorUnits(subtotalMinor,base);taxMinor=addMinorUnits(taxMinor,tax);
    lines.push({productId:line.productId,unitCost:cost,taxRate:rate});
  }
  const quote:RfqSupplierQuote={
    supplierId:input.supplierId,quoteReference:input.quoteReference.trim(),validUntil,lines,
    subtotal:fromMinorUnits(subtotalMinor),taxAmount:fromMinorUnits(taxMinor),
    total:fromMinorUnits(addMinorUnits(subtotalMinor,taxMinor)),recordedAt:nowISO()
  };
  const before=clone(r),i=r.quotes.findIndex(q=>q.supplierId===input.supplierId);
  if(i>=0)r.quotes[i]=quote;else r.quotes.push(quote);
  r.version++;r.updatedAt=nowISO();
  auditAction("procurement.rfq.quote","procurement_rfqs",id,before,clone(r));
  touchPersistence();return clone(r);
}
export function compareProcurementRfqQuotes(id:string): RfqSupplierQuote[] {
  assertPermission("purchases.manage");
  const r=requireScopedRecord(id);
  return r.quotes.map(q=>({...q,lines:q.lines.map(l=>({...l}))}))
    .sort((a,b)=>a.total-b.total||a.supplierId.localeCompare(b.supplierId));
}
export function awardProcurementRfq(id:string,expectedVersion:number,supplierId:string): {
  rfq:ProcurementRfq; purchaseOrder:PurchaseOrder;
} {
  assertPermission("purchases.manage");
  const r=requireScopedRecord(id);
  if(r.status==="awarded"&&r.awardedSupplierId===supplierId&&r.purchaseOrderId){
    const prior=procurement.getPurchaseOrder(r.purchaseOrderId);
    if(prior && prior.supplierId===supplierId) return {rfq:clone(r),purchaseOrder:prior};
    throw new Error("Awarded purchase order is missing or no longer valid");
  }
  revision(r,expectedVersion);
  if(r.status!=="issued") throw new Error("RFQ must be issued and not yet awarded");
  const quote=r.quotes.find(q=>q.supplierId===supplierId);
  if(!quote)throw new Error("Supplier has not submitted a quotation");
  if(quote.validUntil<today())throw new Error("Supplier quotation has expired");
  currentSupplier(supplierId);
  const byProduct=new Map(quote.lines.map(q=>[q.productId,q]));
  const lines=r.lines.map(line=>{
    currentProduct(line.productId);
    const q=byProduct.get(line.productId);
    if(!q)throw new Error("Selected quote is missing a product");
    return {productId:line.productId,description:line.description,
      quantity:line.quantity,unitCost:q.unitCost,taxRate:q.taxRate};
  });
  const created=procurement.createPurchaseOrder({
    supplierId,expectedDeliveryDate:r.requiredBy,branchId:r.branchId,
    lines,notes:"RFQ "+r.reference+" / Supplier quote "+quote.quoteReference+
      (r.notes?" / "+r.notes:""),
  });
  if(created.errors.length||!created.purchaseOrder){
    throw new Error(created.errors.join("; ")||"Could not create selected purchase order");
  }
  const before=clone(r);r.status="awarded";r.awardedSupplierId=supplierId;
  r.purchaseOrderId=created.purchaseOrder.id;r.updatedAt=nowISO();r.version++;
  auditAction("procurement.rfq.award","procurement_rfqs",id,before,clone(r));
  touchPersistence();
  return {rfq:clone(r),purchaseOrder:created.purchaseOrder};
}
export function cancelProcurementRfq(id:string,expectedVersion:number):ProcurementRfq {
  assertPermission("purchases.manage");
  const r=requireScopedRecord(id);revision(r,expectedVersion);
  if(r.status==="awarded")throw new Error("An awarded RFQ cannot cancel its already-created PO");
  if(r.status==="cancelled")return clone(r);
  const before=clone(r);r.status="cancelled";r.updatedAt=nowISO();r.version++;
  auditAction("procurement.rfq.cancel","procurement_rfqs",id,before,clone(r));
  touchPersistence();return clone(r);
}
export function exportProcurementRfqState(): {records:ProcurementRfq[]} {
  return {records:copyList()};
}
/** Backward-compatible snapshot restore, strict enough to reject malformed bid/award links. */
export function hydrateProcurementRfqState(input:{records?:ProcurementRfq[]} | null | undefined):void {
  const values=input?.records??[];
  if(!Array.isArray(values)||values.length>10000)throw new Error("Invalid RFQ snapshot");
  const seen=new Set<string>(),references=new Set<string>();
  const restored=values.map(item=>{
    if(!item||typeof item.id!=="string"||!item.id||typeof item.reference!=="string"||!item.reference||
      !validStatuses.has(item.status)||typeof item.version!=="number"||
      !Number.isSafeInteger(item.version)||item.version<1||
      (item.branchId!==null&&typeof item.branchId!=="string")||
      !Array.isArray(item.supplierIds)||!Array.isArray(item.lines)||!Array.isArray(item.quotes)||
      item.supplierIds.length<1||item.supplierIds.length>25||
      item.lines.length<1||item.lines.length>50||
      typeof item.createdAt!=="string"||typeof item.updatedAt!=="string"){
      throw new Error("Invalid RFQ snapshot record");
    }
    exactDay(item.requiredBy);
    if(new Set(item.supplierIds).size!==item.supplierIds.length||
       new Set(item.lines.map(l=>l.productId)).size!==item.lines.length||
       !item.lines.every(l=>l&&typeof l.productId==="string"&&typeof l.description==="string"&&
         Number.isFinite(l.quantity)&&l.quantity>0)){
      throw new Error("Invalid RFQ snapshot product/supplier identity");
    }
    const key=String(item.branchId)+"|"+item.reference;
    if(seen.has(item.id)||(references.has(key)&&item.status!=="cancelled"))throw new Error("Duplicate RFQ snapshot");
    seen.add(item.id);if(item.status!=="cancelled")references.add(key);
    if(item.status==="awarded"&&(!item.awardedSupplierId||!item.purchaseOrderId)){
      throw new Error("Awarded RFQ lost its purchase order link");
    }
    if(item.status!=="awarded"&&(item.awardedSupplierId||item.purchaseOrderId)){
      throw new Error("Unawarded RFQ has a purchase order link");
    }
    if(new Set(item.quotes.map(q=>q.supplierId)).size!==item.quotes.length||
       !item.quotes.every(q=>q&&item.supplierIds.includes(q.supplierId)&&
         Number.isSafeInteger(Math.round(q.total*100))&&q.total>=0&&
         Array.isArray(q.lines)&&q.lines.length===item.lines.length)){
      throw new Error("Invalid RFQ supplier quotations in snapshot");
    }
    return clone(item);
  });
  records.splice(0,records.length,...restored);
}
