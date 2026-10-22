/**
 * INV-005 opt-in SQLite pilot: FEFO lot hold → cancel or sale settlement.
 *
 * Pure host-owned synchronous SQLite connection and warehouse authority only.
 * This must NOT be called from a renderer, production checkout, or cloud sync.
 * The authoritative ledger/payment integrations are still unimplemented.
 */
import { planFefoLotAllocations, type TrackedLot } from "./tracked-inventory";
import type {
  LotPilotDatabase, LotPilotAllocation, AuthorizeLotWarehouse,
} from "./lot-stock-sqlite-pilot";

interface Common {
  readonly orgId:string;
  readonly warehouseId:string;
  readonly reservationId:string;
  readonly authorizeWarehouse:AuthorizeLotWarehouse;
}
export interface LotHoldInput extends Common {
  readonly productId:string;
  readonly businessDate:string;
  readonly quantityMilli:number;
}
export interface LotHoldCancellationInput extends Common {
  readonly cancellationEventId:string;
}
export interface LotHoldSaleInput extends Common {
  readonly saleEventId:string;
  readonly businessDate:string;
  /** Only the trusted SQLite host may supply a financial writer. */
  readonly commitFinancialEvent:
    (db:LotPilotDatabase,allocations:readonly LotPilotAllocation[])=>void;
}
export interface LotHoldOutcome {
  readonly disposition:"applied"|"already_applied";
  readonly reservationId:string;
  readonly status:"active"|"cancelled"|"committed";
  readonly allocations:readonly LotPilotAllocation[];
  readonly terminalEventId:string|null;
}
interface PilotLot extends TrackedLot {
  readonly version:number;
}
interface Reservation {
  readonly orgId:string;
  readonly reservationId:string;
  readonly warehouseId:string;
  readonly productId:string;
  readonly businessDate:string;
  readonly quantityMilli:number;
  readonly status:"active"|"cancelled"|"committed";
  readonly terminalEventId:string|null;
  readonly allocations:readonly LotPilotAllocation[];
  readonly payload:string;
}
const safeId=(v:unknown):v is string=>
  typeof v==="string"&&v.length>0&&v.length<=128&&v.trim()===v;
const safeQty=(v:unknown):v is number=>
  typeof v==="number"&&Number.isSafeInteger(v)&&v>0;
function validDate(v:unknown):v is string {
  if(typeof v!=="string"||!/^20\d\d-\d\d-\d\d$/.test(v))return false;
  const d=new Date(v+"T00:00:00.000Z");
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
}
function auth(input:Common):void{
  if(!input||!safeId(input.orgId)||!safeId(input.warehouseId)||
     !safeId(input.reservationId)||typeof input.authorizeWarehouse!=="function"){
    throw new Error("Trusted FEFO warehouse authorization is required");
  }
  input.authorizeWarehouse(input.orgId,input.warehouseId);
}
function one(db:LotPilotDatabase,label:string):void {
  const n=Number(db.query("SELECT changes() AS affected")[0]?.affected);
  if(n!==1)throw new Error(label+" CAS conflict; reservation transaction rolled back");
}
function parseAllocations(raw:unknown):readonly LotPilotAllocation[] {
  let value:unknown;
  try{value=JSON.parse(String(raw));}catch{throw new Error("Corrupt reservation allocations");}
  if(!Array.isArray(value)||value.length<1||value.length>10000)
    throw new Error("Invalid reservation allocations");
  const seen=new Set<string>();
  return value.map(raw=>{
    const a=raw as Record<string,unknown>;
    if(!a||typeof a!=="object"||Array.isArray(a)||
      !safeId(a.lotId)||!safeId(a.batchCode)||!safeQty(a.quantityMilli)||
      Object.keys(a).some(k=>!["lotId","batchCode","quantityMilli"].includes(k))||
      seen.has(a.lotId)){
      throw new Error("Invalid or duplicate reservation lot allocation");
    }
    seen.add(a.lotId);
    return {lotId:a.lotId,batchCode:a.batchCode,quantityMilli:a.quantityMilli};
  });
}
function parseReservation(db:LotPilotDatabase,input:Common):Reservation|null {
  const rows=db.query(`SELECT org_id,reservation_id,warehouse_id,product_id,
    business_date,quantity_milli,allocations_json,payload_json,status,terminal_event_id
    FROM inv_lot_reservation_pilot_v1 WHERE org_id=? AND reservation_id=?`,
    [input.orgId,input.reservationId]);
  if(rows.length>1)throw new Error("Duplicate reservation identity");
  if(!rows.length)return null;
  const row=rows[0];
  const allocations=parseAllocations(row.allocations_json);
  const amount=Number(row.quantity_milli);
  const total=allocations.reduce((sum,a)=>sum+BigInt(a.quantityMilli),0n);
  if(!safeQty(amount)||total!==BigInt(amount)||
     !safeId(row.product_id)||!validDate(row.business_date)||
     !["active","cancelled","committed"].includes(String(row.status))||
     row.warehouse_id!==input.warehouseId||
     (row.terminal_event_id!=null&&!safeId(row.terminal_event_id))||
     (row.status==="active"&&row.terminal_event_id!=null)||
     (row.status!=="active"&&row.terminal_event_id==null)){
    throw new Error("Reservation data corrupted or warehouse scope changed");
  }
  return {
    orgId:input.orgId,reservationId:input.reservationId,
    warehouseId:input.warehouseId,productId:String(row.product_id),
    businessDate:String(row.business_date),quantityMilli:amount,
    status:row.status as Reservation["status"],
    terminalEventId:row.terminal_event_id==null?null:String(row.terminal_event_id),
    allocations,payload:String(row.payload_json),
  };
}
function storedEvent(db:LotPilotDatabase,orgId:string,eventId:string) {
  const rows=db.query(`SELECT event_type,warehouse_id,payload_json,allocations_json
    FROM inv_lot_event_pilot_v1 WHERE org_id=? AND event_id=?`,[orgId,eventId]);
  if(rows.length>1)throw new Error("Duplicate reservation event identity");
  return rows[0]??null;
}
function matchEvent(
  db:LotPilotDatabase,orgId:string,eventId:string,warehouseId:string,
  kind:"reserve"|"reserve_cancel"|"sale",payload:string,
  allocations:readonly LotPilotAllocation[],
):boolean{
  const prior=storedEvent(db,orgId,eventId);
  if(!prior)return false;
  const saved=parseAllocations(prior.allocations_json);
  if(prior.event_type!==kind||prior.warehouse_id!==warehouseId||
    prior.payload_json!==payload||
    JSON.stringify(saved)!==JSON.stringify(allocations)){
    throw new Error("Idempotency event ID conflicts with another lot operation");
  }
  return true;
}
function insertEvent(
  db:LotPilotDatabase,orgId:string,warehouseId:string,eventId:string,
  kind:"reserve"|"reserve_cancel"|"sale",payload:string,
  allocations:readonly LotPilotAllocation[],
):void{
  db.exec(`INSERT INTO inv_lot_event_pilot_v1
    (org_id,event_id,event_type,warehouse_id,payload_json,allocations_json)
    VALUES(?,?,?,?,?,?)`,
    [orgId,eventId,kind,warehouseId,payload,JSON.stringify(allocations)]);
  one(db,"Reservation event");
}
function currentLot(db:LotPilotDatabase,input:Common,lotId:string):PilotLot {
  const rows=db.query(`SELECT id,org_id,warehouse_id,product_id,batch_code,
       expires_on,on_hand_milli,reserved_milli,status,version
      FROM inv_lot_pilot_v1
      WHERE org_id=? AND warehouse_id=? AND id=?`,
    [input.orgId,input.warehouseId,lotId]);
  if(rows.length!==1)throw new Error("Reserved batch is no longer present");
  const row=rows[0];
  const onHandMilli=Number(row.on_hand_milli),reservedMilli=Number(row.reserved_milli);
  const version=Number(row.version);
  if(!Number.isSafeInteger(onHandMilli)||onHandMilli<0||
     !Number.isSafeInteger(reservedMilli)||reservedMilli<0||
     reservedMilli>onHandMilli||
     !Number.isSafeInteger(version)||version<=0||version>=Number.MAX_SAFE_INTEGER||
     !validDate(row.expires_on)){
    throw new Error("Invalid reserved stock amount, expiry or revision");
  }
  return {
    id:String(row.id),orgId:input.orgId,warehouseId:input.warehouseId,
    productId:String(row.product_id),batchCode:String(row.batch_code),
    expiresOn:String(row.expires_on),onHandMilli,reservedMilli,
    status:row.status as PilotLot["status"],version,
  };
}
function saveCount(
 db:LotPilotDatabase,lot:PilotLot,onHand:number,reserved:number,
):void {
  if(!Number.isSafeInteger(onHand)||onHand<0||
     !Number.isSafeInteger(reserved)||reserved<0||reserved>onHand){
    throw new Error("Invalid resulting reserved stock");
  }
  db.exec(`UPDATE inv_lot_pilot_v1 SET on_hand_milli=?,reserved_milli=?,version=?
    WHERE org_id=? AND warehouse_id=? AND id=? AND product_id=?
      AND batch_code=? AND expires_on=? AND status=?
      AND on_hand_milli=? AND reserved_milli=? AND version=?`,
    [onHand,reserved,lot.version+1,lot.orgId,lot.warehouseId,lot.id,
     lot.productId,lot.batchCode,lot.expiresOn,lot.status,
     lot.onHandMilli,lot.reservedMilli,lot.version]);
  one(db,"Reservation lot");
}
function prepareLots(db:LotPilotDatabase,input:Common,productId:string):PilotLot[] {
  return db.query(`SELECT id FROM inv_lot_pilot_v1
    WHERE org_id=? AND warehouse_id=? AND product_id=? ORDER BY id`,
    [input.orgId,input.warehouseId,productId],
  ).map(row=>currentLot(db,input,String(row.id)));
}
function holdPayload(input:LotHoldInput):string {
  return JSON.stringify({orgId:input.orgId,warehouseId:input.warehouseId,
    reservationId:input.reservationId,productId:input.productId,
    businessDate:input.businessDate,quantityMilli:input.quantityMilli});
}
function cancelPayload(input:LotHoldCancellationInput):string{
  return JSON.stringify({orgId:input.orgId,warehouseId:input.warehouseId,
    eventId:input.cancellationEventId,reservationId:input.reservationId});
}
function salePayload(input:LotHoldSaleInput,record:Reservation):string{
  // Match the existing sale-event shape: return/QC pipeline reads these fields.
  return JSON.stringify({orgId:input.orgId,warehouseId:input.warehouseId,
    eventId:input.saleEventId,productId:record.productId,
    businessDate:input.businessDate,quantityMilli:record.quantityMilli});
}

/** Reserve available FEFO stock. This creates no receivable, sale or payment. */
export function reservePilotFefoLotsSqlite(
 db:LotPilotDatabase,input:LotHoldInput,
):LotHoldOutcome {
  if(!input||!safeId(input.productId)||!validDate(input.businessDate)||!safeQty(input.quantityMilli)){
    throw new Error("Invalid FEFO reservation request");
  }
  auth(input);
  const payload=holdPayload(input);
  return db.transaction(()=>{
    auth(input);
    const prior=parseReservation(db,input);
    if(prior){
      if(prior.payload!==payload||
         !matchEvent(db,input.orgId,input.reservationId,input.warehouseId,
           "reserve",payload,prior.allocations)){
        throw new Error("Reservation ID conflicts with a different request");
      }
      return {
        disposition:"already_applied",reservationId:input.reservationId,
        status:prior.status,allocations:prior.allocations,terminalEventId:prior.terminalEventId,
      };
    }
    if(storedEvent(db,input.orgId,input.reservationId)){
      throw new Error("Reservation ID already used for another lot event");
    }
    const lots=prepareLots(db,input,input.productId);
    const picks=planFefoLotAllocations({
      orgId:input.orgId,warehouseId:input.warehouseId,productId:input.productId,
      asOfDate:input.businessDate,quantityMilli:input.quantityMilli,lots,
    });
    const byId=new Map(lots.map(l=>[l.id,l]));
    const allocations=picks.map(p=>{
      const lot=byId.get(p.batchId)!;
      return {lotId:lot.id,batchCode:lot.batchCode,quantityMilli:p.quantityMilli};
    });
    for(const p of picks){
      const lot=byId.get(p.batchId)!;
      const next=lot.reservedMilli+p.quantityMilli;
      if(!Number.isSafeInteger(next)||next>lot.onHandMilli){
        throw new Error("Reservation exceeds physically available lot stock");
      }
      saveCount(db,lot,lot.onHandMilli,next);
    }
    db.exec(`INSERT INTO inv_lot_reservation_pilot_v1
      (org_id,reservation_id,warehouse_id,product_id,business_date,
       quantity_milli,allocations_json,payload_json,status,terminal_event_id)
      VALUES(?,?,?,?,?,?,?,?,'active',NULL)`,
      [input.orgId,input.reservationId,input.warehouseId,input.productId,
       input.businessDate,input.quantityMilli,JSON.stringify(allocations),payload]);
    one(db,"Reservation identity");
    insertEvent(db,input.orgId,input.warehouseId,input.reservationId,
      "reserve",payload,allocations);
    return {
      disposition:"applied",reservationId:input.reservationId,status:"active",
      allocations,terminalEventId:null,
    };
  });
}

/** Release an entire active reservation; cannot cancel already committed sales. */
export function cancelPilotFefoReservationSqlite(
 db:LotPilotDatabase,input:LotHoldCancellationInput,
):LotHoldOutcome {
  if(!input||!safeId(input.cancellationEventId)||
     input.cancellationEventId===input.reservationId){
    throw new Error("Invalid cancellation event identity");
  }
  auth(input);
  const payload=cancelPayload(input);
  return db.transaction(()=>{
    auth(input);
    const record=parseReservation(db,input);
    if(!record)throw new Error("Unknown FEFO reservation");
    if(record.status==="cancelled"&&record.terminalEventId===input.cancellationEventId){
      if(!matchEvent(db,input.orgId,input.cancellationEventId,input.warehouseId,
        "reserve_cancel",payload,record.allocations))throw new Error("Missing cancellation event");
      return {disposition:"already_applied",reservationId:input.reservationId,
        status:"cancelled",allocations:record.allocations,terminalEventId:input.cancellationEventId};
    }
    if(record.status!=="active")throw new Error("Reservation has already been settled");
    if(storedEvent(db,input.orgId,input.cancellationEventId)){
      throw new Error("Cancellation event ID already used");
    }
    for(const allocation of record.allocations){
      const lot=currentLot(db,input,allocation.lotId);
      if(lot.productId!==record.productId||lot.batchCode!==allocation.batchCode||
        lot.reservedMilli<allocation.quantityMilli){
        throw new Error("Reserved lot no longer matches its original allocation");
      }
      saveCount(db,lot,lot.onHandMilli,lot.reservedMilli-allocation.quantityMilli);
    }
    db.exec(`UPDATE inv_lot_reservation_pilot_v1
      SET status='cancelled',terminal_event_id=?
      WHERE org_id=? AND reservation_id=? AND warehouse_id=?
        AND product_id=? AND status='active' AND terminal_event_id IS NULL`,
      [input.cancellationEventId,input.orgId,input.reservationId,input.warehouseId,record.productId]);
    one(db,"Reservation cancellation");
    insertEvent(db,input.orgId,input.warehouseId,input.cancellationEventId,
      "reserve_cancel",payload,record.allocations);
    return {disposition:"applied",reservationId:input.reservationId,status:"cancelled",
      allocations:record.allocations,terminalEventId:input.cancellationEventId};
  });
}

/** Atomically charge once, debit source lots, and release the reserved quantity. */
export function commitPilotFefoReservationSaleSqlite(
 db:LotPilotDatabase,input:LotHoldSaleInput,
):LotHoldOutcome {
  if(!input||!safeId(input.saleEventId)||input.saleEventId===input.reservationId||
     !validDate(input.businessDate)){
    throw new Error("Invalid reserved-sale event or business date");
  }
  auth(input);
  if(typeof input.commitFinancialEvent!=="function"){
    throw new Error("Reserved sale requires host-owned financial SQL writer");
  }
  return db.transaction(()=>{
    auth(input);
    const record=parseReservation(db,input);
    if(!record)throw new Error("Unknown FEFO reservation");
    const payload=salePayload(input,record);
    if(record.status==="committed"&&record.terminalEventId===input.saleEventId){
      if(!matchEvent(db,input.orgId,input.saleEventId,input.warehouseId,
        "sale",payload,record.allocations))throw new Error("Missing committed sale event");
      return {disposition:"already_applied",reservationId:input.reservationId,
        status:"committed",allocations:record.allocations,terminalEventId:input.saleEventId};
    }
    if(record.status!=="active")throw new Error("Reservation is no longer available for checkout");
    if(input.businessDate<record.businessDate){
      throw new Error("Sale cannot precede reservation business date");
    }
    if(storedEvent(db,input.orgId,input.saleEventId))throw new Error("Sale event ID already used");
    const source=record.allocations.map(a=>{
      const lot=currentLot(db,input,a.lotId);
      if(lot.productId!==record.productId||lot.batchCode!==a.batchCode||
        lot.status!=="active"||lot.expiresOn<input.businessDate||
        lot.reservedMilli<a.quantityMilli||lot.onHandMilli<a.quantityMilli){
        throw new Error("Held lot is unavailable, blocked, expired or no longer reserved");
      }
      return {allocation:a,lot};
    });
    const before=Number(db.query("SELECT total_changes() AS n")[0]?.n);
    if(!Number.isSafeInteger(before)||before<0)throw new Error("SQLite financial counter unavailable");
    input.commitFinancialEvent(db,record.allocations);
    const after=Number(db.query("SELECT total_changes() AS n")[0]?.n);
    if(!Number.isSafeInteger(after)||after<=before){
      throw new Error("Required financial sale writer made no SQL change");
    }
    for(const {allocation,lot} of source){
      saveCount(db,lot,lot.onHandMilli-allocation.quantityMilli,
        lot.reservedMilli-allocation.quantityMilli);
    }
    db.exec(`UPDATE inv_lot_reservation_pilot_v1 SET
      status='committed',terminal_event_id=?
      WHERE org_id=? AND warehouse_id=? AND reservation_id=? AND
        product_id=? AND status='active' AND terminal_event_id IS NULL`,
      [input.saleEventId,input.orgId,input.warehouseId,input.reservationId,record.productId]);
    one(db,"Reservation sale settlement");
    insertEvent(db,input.orgId,input.warehouseId,input.saleEventId,
      "sale",payload,record.allocations);
    return {disposition:"applied",reservationId:input.reservationId,status:"committed",
      allocations:record.allocations,terminalEventId:input.saleEventId};
  });
}
