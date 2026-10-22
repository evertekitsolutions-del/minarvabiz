/**
 * INV-005: isolated sale-return acceptance and quarantined lot custody.
 *
 * Provenance and totals are read only from committed SQLite sale + return
 * records. No uninspected returned lot becomes saleable stock. Separate
 * pilot tables, not attached to production POS, GL, WMS or financial outbox.
 */
import type {
  LotPilotDatabase,
  LotPilotAllocation,
  AuthorizeLotWarehouse,
} from "./lot-stock-sqlite-pilot";

export interface LotPilotReturnInput {
  readonly orgId: string;
  readonly warehouseId: string;
  readonly returnEventId: string;
  readonly saleEventId: string;
  readonly productId: string;
  readonly returnDate: string;
  readonly quantityMilli: number;
  readonly authorizeWarehouse: AuthorizeLotWarehouse;
  /**
   * Host-owned SQL return/refund writer, same SQLite transaction. This check
   * only proves a SQL write occurred, not a valid financial posting/refund.
   */
  readonly commitFinancialReturn: (
    db: LotPilotDatabase,
    allocations: readonly LotPilotAllocation[],
  ) => void;
}
export interface LotPilotReturnOutcome {
  readonly disposition: "applied" | "already_applied";
  readonly returnEventId: string;
  readonly saleEventId: string;
  readonly quantityMilli: number;
  readonly allocations: readonly LotPilotAllocation[];
  readonly quarantineOnly: true;
}
const safeId=(v:unknown):v is string=>
  typeof v==="string" && v.length>0 && v.length<=128 && v.trim()===v;
const safeQty=(v:unknown):v is number=>
  typeof v==="number" && Number.isSafeInteger(v) && v>0;
function validDay(v:unknown):v is string {
  if(typeof v!=="string"||!/^20\d{2}-\d\d-\d\d$/.test(v))return false;
  const d=new Date(v+"T00:00:00.000Z");
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;
}
function authorize(input:LotPilotReturnInput):void {
  if(!safeId(input.orgId)||!safeId(input.warehouseId)||
      typeof input.authorizeWarehouse!=="function"){
    throw new Error("Trusted return warehouse authorization is required");
  }
  input.authorizeWarehouse(input.orgId,input.warehouseId);
}
function affected(db:LotPilotDatabase):void {
  const count=Number(db.query("SELECT changes() AS affected")[0]?.affected);
  if(count!==1)throw new Error("Pilot return write CAS conflict");
}
function serial(input:LotPilotReturnInput):string {
  return JSON.stringify({
    orgId:input.orgId,warehouseId:input.warehouseId,
    returnEventId:input.returnEventId,saleEventId:input.saleEventId,
    productId:input.productId,returnDate:input.returnDate,
    quantityMilli:input.quantityMilli,
  });
}
function readEvent(db:LotPilotDatabase,orgId:string,eventId:string){
  const rows=db.query(
    "SELECT event_type,warehouse_id,payload_json,allocations_json FROM inv_lot_event_pilot_v1 WHERE org_id=? AND event_id=?",
    [orgId,eventId],
  );
  if(rows.length>1)throw new Error("Duplicate persisted lot event");
  return rows[0]??null;
}
function parseAllocations(raw:unknown):LotPilotAllocation[]{
  let rows:unknown;
  try{rows=JSON.parse(String(raw));}catch{throw new Error("Corrupt persisted lot allocations");}
  if(!Array.isArray(rows)||rows.length<1||rows.length>10000)throw new Error("Invalid persisted lot allocations");
  const seen=new Set<string>();
  return rows.map(item=>{
    if(!item||typeof item!=="object"||Array.isArray(item))throw new Error("Invalid persisted lot allocation");
    const x=item as Record<string,unknown>;
    if(!safeId(x.lotId)||!safeId(x.batchCode)||!safeQty(x.quantityMilli)||
       seen.has(x.lotId)||Object.keys(x).some(k=>!["lotId","batchCode","quantityMilli"].includes(k))){
      throw new Error("Invalid or duplicate persisted lot allocation");
    }
    seen.add(x.lotId);
    return {lotId:x.lotId,batchCode:x.batchCode,quantityMilli:x.quantityMilli};
  });
}
function sumMilli(rows:readonly LotPilotAllocation[]):bigint {
  return rows.reduce((n,x)=>n+BigInt(x.quantityMilli),0n);
}
function checkedReturnRecord(
 db:LotPilotDatabase,input:LotPilotReturnInput,
 allocations:readonly LotPilotAllocation[],
):void {
  const rows=db.query(
    `SELECT sale_event_id,warehouse_id,product_id,quantity_milli,allocations_json
       FROM inv_lot_return_pilot_v1 WHERE org_id=? AND return_event_id=?`,
    [input.orgId,input.returnEventId],
  );
  if(rows.length!==1)throw new Error("Persisted return event has no matching custody record");
  const row=rows[0],stored=parseAllocations(row.allocations_json);
  if(row.sale_event_id!==input.saleEventId||row.warehouse_id!==input.warehouseId||
     row.product_id!==input.productId||Number(row.quantity_milli)!==input.quantityMilli||
     JSON.stringify(stored)!==JSON.stringify(allocations)){
    throw new Error("Persisted return custody record conflicts with event");
  }
  const quarantine=db.query(
    `SELECT lot_id,batch_code,quantity_milli,status
       FROM inv_lot_quarantine_pilot_v1 WHERE org_id=? AND return_event_id=? ORDER BY lot_id`,
    [input.orgId,input.returnEventId],
  );
  if(quarantine.length!==stored.length)throw new Error("Quarantine record count mismatch");
  const byId=new Map(quarantine.map(x=>[x.lot_id,x]));
  for(const a of stored){
    const x=byId.get(a.lotId);
    if(!x||x.status!=="quarantined"||x.batch_code!==a.batchCode||
       Number(x.quantity_milli)!==a.quantityMilli){
      throw new Error("Quarantine custody record does not match original return");
    }
  }
}
export function acceptPilotLotReturnSqlite(
  db:LotPilotDatabase,input:LotPilotReturnInput,
):LotPilotReturnOutcome {
  if(!input||!safeId(input.returnEventId)||!safeId(input.saleEventId)||
     input.returnEventId===input.saleEventId||!safeId(input.productId)||
     !validDay(input.returnDate)||!safeQty(input.quantityMilli)){
    throw new Error("Invalid batch sale return");
  }
  authorize(input);
  if(typeof input.commitFinancialReturn!=="function"){
    throw new Error("Return requires same-transaction financial refund writer");
  }
  const payload=serial(input);
  return db.transaction(()=>{
    authorize(input);
    const existing=readEvent(db,input.orgId,input.returnEventId);
    if(existing){
      if(existing.event_type!=="return"||existing.warehouse_id!==input.warehouseId||
         existing.payload_json!==payload){
        throw new Error("Return idempotency key conflicts with a different stock event");
      }
      const original=parseAllocations(existing.allocations_json);
      if(sumMilli(original)!==BigInt(input.quantityMilli))throw new Error("Corrupt replay return quantity");
      checkedReturnRecord(db,input,original);
      return {
        disposition:"already_applied",returnEventId:input.returnEventId,
        saleEventId:input.saleEventId,quantityMilli:input.quantityMilli,
        allocations:original,quarantineOnly:true,
      };
    }
    const sale=readEvent(db,input.orgId,input.saleEventId);
    if(!sale||sale.event_type!=="sale"||sale.warehouse_id!==input.warehouseId){
      throw new Error("Authoritative source sale event unavailable in warehouse");
    }
    let salePayload:unknown;
    try{salePayload=JSON.parse(String(sale.payload_json));}catch{
      throw new Error("Corrupt source sale event");
    }
    const p=salePayload as Record<string,unknown>;
    if(!p||typeof p!=="object"||p.orgId!==input.orgId||
       p.warehouseId!==input.warehouseId||p.productId!==input.productId||
       p.eventId!==input.saleEventId||!validDay(p.businessDate)||
       input.returnDate<p.businessDate||!safeQty(p.quantityMilli)){
      throw new Error("Return does not match posted sale or return date precedes sale");
    }
    const sold=parseAllocations(sale.allocations_json);
    if(sumMilli(sold)!==BigInt(p.quantityMilli)){
      throw new Error("Source sale lot allocation does not reconcile to sold quantity");
    }
    const prior=db.query(
      `SELECT return_event_id,quantity_milli,allocations_json
         FROM inv_lot_return_pilot_v1 WHERE org_id=? AND sale_event_id=?`,
      [input.orgId,input.saleEventId],
    );
    const returned=new Map<string,bigint>();
    let priorTotal=0n;
    const originalById=new Map(sold.map(x=>[x.lotId,x]));
    for(const row of prior){
      if(!safeId(row.return_event_id)||!safeQty(Number(row.quantity_milli))){
        throw new Error("Corrupt prior return amount");
      }
      const used=parseAllocations(row.allocations_json);
      if(sumMilli(used)!==BigInt(Number(row.quantity_milli))){
        throw new Error("Prior return does not reconcile");
      }
      priorTotal+=sumMilli(used);
      for(const alloc of used){
        const source=originalById.get(alloc.lotId);
        if(!source||source.batchCode!==alloc.batchCode){
          throw new Error("Prior return lot did not originate from source sale");
        }
        const amount=(returned.get(alloc.lotId)??0n)+BigInt(alloc.quantityMilli);
        if(amount>BigInt(source.quantityMilli)){
          throw new Error("Prior returns exceed original sold lot allocation");
        }
        returned.set(alloc.lotId,amount);
      }
    }
    if(priorTotal+BigInt(input.quantityMilli)>BigInt(p.quantityMilli)){
      throw new Error("Return exceeds quantity sold after existing partial returns");
    }
    let remaining=BigInt(input.quantityMilli);
    const allocations:LotPilotAllocation[]=[];
    for(const row of sold){
      const available=BigInt(row.quantityMilli)-(returned.get(row.lotId)??0n);
      const take=available<remaining?available:remaining;
      if(take>0n){
        allocations.push({lotId:row.lotId,batchCode:row.batchCode,quantityMilli:Number(take)});
        remaining-=take;
      }
      if(remaining===0n)break;
    }
    if(remaining!==0n||sumMilli(allocations)!==BigInt(input.quantityMilli)){
      throw new Error("Return cannot be reconciled to original sale lots");
    }
    const before=Number(db.query("SELECT total_changes() AS n")[0]?.n);
    if(!Number.isSafeInteger(before))throw new Error("SQLite financial audit counter unavailable");
    input.commitFinancialReturn(db,allocations);
    const after=Number(db.query("SELECT total_changes() AS n")[0]?.n);
    if(!Number.isSafeInteger(after)||after<=before){
      throw new Error("Required same-transaction return finance writer made no SQL change");
    }
    db.exec(`INSERT INTO inv_lot_event_pilot_v1
      (org_id,event_id,event_type,warehouse_id,payload_json,allocations_json)
      VALUES(?,?,?,?,?,?)`,
      [input.orgId,input.returnEventId,"return",input.warehouseId,
        payload,JSON.stringify(allocations)],
    );
    affected(db);
    db.exec(`INSERT INTO inv_lot_return_pilot_v1
      (org_id,return_event_id,sale_event_id,warehouse_id,product_id,quantity_milli,allocations_json)
      VALUES(?,?,?,?,?,?,?)`,
      [input.orgId,input.returnEventId,input.saleEventId,input.warehouseId,
       input.productId,input.quantityMilli,JSON.stringify(allocations)],
    );
    affected(db);
    for(const pick of allocations){
      db.exec(`INSERT INTO inv_lot_quarantine_pilot_v1
        (org_id,return_event_id,warehouse_id,product_id,lot_id,batch_code,quantity_milli,status)
        VALUES(?,?,?,?,?,?,?,'quarantined')`,
        [input.orgId,input.returnEventId,input.warehouseId,input.productId,
         pick.lotId,pick.batchCode,pick.quantityMilli],
      );
      affected(db);
    }
    // Deliberately do NOT increment inv_lot_pilot_v1.on_hand_milli:
    // QC return acceptance and saleable-stock receipt are different events.
    return {
      disposition:"applied",returnEventId:input.returnEventId,
      saleEventId:input.saleEventId,quantityMilli:input.quantityMilli,
      allocations,quarantineOnly:true,
    };
  });
}
