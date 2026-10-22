/**
 * INV-005 pilot: isolated, genuinely atomic SQLite GRN-to-FEFO-sale lifecycle.
 *
 * Tables do not overlap production stock/finance tables. NO production POS,
 * Product.stockQuantity, real GRN/GL, Hybrid outbox or cloud sync integration.
 * Host MUST own the SQLite connection, authenticated authority and financial
 * event callback. Never construct that authority in a renderer.
 */
import { planFefoLotAllocations, type TrackedLot } from "./tracked-inventory";

export interface LotPilotDatabase {
  exec(sql: string, params?: unknown[]): void;
  query(sql: string, params?: unknown[]): Record<string, unknown>[];
  transaction<T>(fn: () => T): T;
}
export type AuthorizeLotWarehouse = (orgId: string, warehouseId: string) => void;
export interface LotPilotReceiptInput {
  readonly orgId: string;
  readonly warehouseId: string;
  /** Stable GRN line event, scoped uniquely to tenant. */
  readonly eventId: string;
  readonly lotId: string;
  readonly productId: string;
  readonly batchCode: string;
  readonly expiresOn: string;
  readonly receiptDate: string;
  readonly quantityMilli: number;
  readonly status: "active" | "blocked";
  readonly authorizeWarehouse: AuthorizeLotWarehouse;
  /** Trusted host-owned SQL financial/GRN writer executed in same transaction. */
  readonly commitReceiptEvent: (db: LotPilotDatabase) => void;
}
export interface LotPilotSaleInput {
  readonly orgId: string;
  readonly warehouseId: string;
  /** Stable checkout/sale event ID. Replays are verified, not re-debited. */
  readonly eventId: string;
  readonly productId: string;
  readonly businessDate: string;
  readonly quantityMilli: number;
  readonly authorizeWarehouse: AuthorizeLotWarehouse;
  /** Trusted host-owned SQL sale/payment/GL writer in same transaction. */
  readonly commitFinancialEvent: (db: LotPilotDatabase, allocations: readonly LotPilotAllocation[]) => void;
}
export interface LotPilotAllocation {
  readonly lotId: string;
  readonly batchCode: string;
  readonly quantityMilli: number;
}
export interface LotPilotOutcome {
  readonly disposition: "applied" | "already_applied";
  readonly eventId: string;
  readonly eventType: "receipt" | "sale";
  readonly allocations: readonly LotPilotAllocation[];
}
interface VersionedLot extends TrackedLot {
  readonly version: number;
}
const cleanId = (x:unknown):x is string =>
  typeof x==="string" && x.length>0 && x.length<=128 && x.trim()===x;
const moneySafe=(n:unknown):n is number=>typeof n==="number"&&Number.isSafeInteger(n)&&n>0;
function isoDay(x:unknown):x is string {
  if(typeof x!=="string"||!/^20\d{2}-\d{2}-\d{2}$/.test(x))return false;
  const date=new Date(x+"T00:00:00.000Z");
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===x;
}
function validBatch(x:unknown):x is string {
  return cleanId(x) && x.length<=64 && !/[\r\n]/.test(x);
}
function requireAccess(check:unknown,orgId:unknown,warehouseId:unknown):void {
  if(typeof check!=="function"||!cleanId(orgId)||!cleanId(warehouseId)){
    throw new Error("Trusted warehouse authorization is required");
  }
  (check as AuthorizeLotWarehouse)(orgId,warehouseId);
}
function changed(db:LotPilotDatabase):number {
  const count=Number(db.query("SELECT changes() AS affected")[0]?.affected);
  if(!Number.isSafeInteger(count)||count<0)throw new Error("SQLite change count unavailable");
  return count;
}
function totalChanges(db:LotPilotDatabase):number {
  const count=Number(db.query("SELECT total_changes() AS n")[0]?.n);
  if(!Number.isSafeInteger(count)||count<0)throw new Error("SQLite cumulative change count unavailable");
  return count;
}
function requireFinancialChange(db:LotPilotDatabase,commit:()=>void):void {
  const before=totalChanges(db);
  commit();
  if(totalChanges(db)<=before)throw new Error("Required same-transaction financial writer made no SQL change");
}
/** Must be explicitly initialized by a trusted integration/test host. */
export function initializeLotStockPilotSqlite(db:LotPilotDatabase):void {
  db.exec(`CREATE TABLE IF NOT EXISTS inv_lot_pilot_v1 (
    org_id TEXT NOT NULL, warehouse_id TEXT NOT NULL, id TEXT NOT NULL,
    product_id TEXT NOT NULL, batch_code TEXT NOT NULL, expires_on TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('active','blocked')),
    on_hand_milli INTEGER NOT NULL CHECK(on_hand_milli >= 0),
    reserved_milli INTEGER NOT NULL DEFAULT 0 CHECK(reserved_milli >= 0 AND reserved_milli <= on_hand_milli),
    version INTEGER NOT NULL CHECK(version > 0),
    PRIMARY KEY(org_id,warehouse_id,id),
    UNIQUE(org_id,warehouse_id,product_id,batch_code)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS inv_lot_event_pilot_v1 (
    org_id TEXT NOT NULL, event_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN ('receipt','sale','return','qc','reserve','reserve_cancel')),
    warehouse_id TEXT NOT NULL, payload_json TEXT NOT NULL,
    allocations_json TEXT NOT NULL,
    PRIMARY KEY(org_id,event_id)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS inv_lot_return_pilot_v1 (
    org_id TEXT NOT NULL, return_event_id TEXT NOT NULL,
    sale_event_id TEXT NOT NULL, warehouse_id TEXT NOT NULL,
    product_id TEXT NOT NULL, quantity_milli INTEGER NOT NULL CHECK(quantity_milli > 0),
    allocations_json TEXT NOT NULL,
    PRIMARY KEY(org_id,return_event_id),
    FOREIGN KEY(org_id,return_event_id) REFERENCES inv_lot_event_pilot_v1(org_id,event_id)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS inv_lot_return_sale_pilot_idx
    ON inv_lot_return_pilot_v1(org_id,sale_event_id)`);
  db.exec(`CREATE TABLE IF NOT EXISTS inv_lot_quarantine_pilot_v1 (
    org_id TEXT NOT NULL, return_event_id TEXT NOT NULL,
    warehouse_id TEXT NOT NULL, product_id TEXT NOT NULL,
    lot_id TEXT NOT NULL, batch_code TEXT NOT NULL,
    quantity_milli INTEGER NOT NULL CHECK(quantity_milli > 0),
    status TEXT NOT NULL DEFAULT 'quarantined' CHECK(status IN ('quarantined','released','rejected')),
    PRIMARY KEY(org_id,return_event_id,lot_id),
    FOREIGN KEY(org_id,return_event_id) REFERENCES inv_lot_return_pilot_v1(org_id,return_event_id)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS inv_lot_reservation_pilot_v1 (
    org_id TEXT NOT NULL, reservation_id TEXT NOT NULL,
    warehouse_id TEXT NOT NULL, product_id TEXT NOT NULL,
    business_date TEXT NOT NULL,
    quantity_milli INTEGER NOT NULL CHECK(quantity_milli > 0),
    allocations_json TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('active','cancelled','committed')),
    terminal_event_id TEXT,
    PRIMARY KEY(org_id,reservation_id)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS inv_lot_reservation_product_pilot_idx
    ON inv_lot_reservation_pilot_v1(org_id,warehouse_id,product_id,status)`);

}
function snapshot(db:LotPilotDatabase,orgId:string,warehouseId:string,productId:string):VersionedLot[]{
  return db.query(`SELECT id,org_id,warehouse_id,product_id,batch_code,expires_on,
      status,on_hand_milli,reserved_milli,version
    FROM inv_lot_pilot_v1
    WHERE org_id=? AND warehouse_id=? AND product_id=? ORDER BY id`,
  [orgId,warehouseId,productId]).map(r=>({
    id:String(r.id),orgId:String(r.org_id),warehouseId:String(r.warehouse_id),
    productId:String(r.product_id),batchCode:String(r.batch_code),expiresOn:String(r.expires_on),
    status:r.status as "active"|"blocked",onHandMilli:Number(r.on_hand_milli),
    reservedMilli:Number(r.reserved_milli),version:Number(r.version),
  }));
}
function eventPayload(input:LotPilotReceiptInput|LotPilotSaleInput):string {
  if("lotId" in input){
    return JSON.stringify({orgId:input.orgId,warehouseId:input.warehouseId,eventId:input.eventId,
      lotId:input.lotId,productId:input.productId,batchCode:input.batchCode,
      expiresOn:input.expiresOn,receiptDate:input.receiptDate,
      quantityMilli:input.quantityMilli,status:input.status});
  }
  return JSON.stringify({orgId:input.orgId,warehouseId:input.warehouseId,eventId:input.eventId,
    productId:input.productId,businessDate:input.businessDate,quantityMilli:input.quantityMilli});
}
function previous(
 db:LotPilotDatabase,orgId:string,eventId:string,kind:"receipt"|"sale",payload:string,
):LotPilotOutcome|null {
  const rows=db.query(`SELECT event_type,warehouse_id,payload_json,allocations_json
     FROM inv_lot_event_pilot_v1 WHERE org_id=? AND event_id=?`,[orgId,eventId]);
  if(rows.length>1)throw new Error("Duplicate persisted pilot event");
  if(!rows.length)return null;
  const row=rows[0];
  if(row.event_type!==kind||row.payload_json!==payload){
    throw new Error("Idempotency event ID conflicts with a different stock transaction");
  }
  let allocations:LotPilotAllocation[];
  try{allocations=JSON.parse(String(row.allocations_json));}catch{
    throw new Error("Corrupt persisted pilot allocations");
  }
  if(!Array.isArray(allocations)||allocations.some(a=>!cleanId(a.lotId)||!validBatch(a.batchCode)||!moneySafe(a.quantityMilli))){
    throw new Error("Invalid persisted pilot allocations");
  }
  return {disposition:"already_applied",eventId,eventType:kind,allocations};
}
function saveEvent(db:LotPilotDatabase,
  input:LotPilotReceiptInput|LotPilotSaleInput,kind:"receipt"|"sale",
  payload:string,allocations:readonly LotPilotAllocation[],
):void {
  db.exec(`INSERT INTO inv_lot_event_pilot_v1
    (org_id,event_id,event_type,warehouse_id,payload_json,allocations_json)
    VALUES(?,?,?,?,?,?)`,
  [input.orgId,input.eventId,kind,input.warehouseId,payload,JSON.stringify(allocations)]);
  if(changed(db)!==1)throw new Error("Pilot event was not committed");
}
/** Unique GRN receipt event + lot CAS + GRN financial writer, all in one transaction. */
export function receivePilotLotSqlite(db:LotPilotDatabase,input:LotPilotReceiptInput):LotPilotOutcome {
  if(!input||!cleanId(input.eventId)||!cleanId(input.lotId)||!cleanId(input.productId)||
    !validBatch(input.batchCode)||!isoDay(input.expiresOn)||!isoDay(input.receiptDate)||
    !moneySafe(input.quantityMilli)||
    (input.status!=="active"&&input.status!=="blocked")||
    (input.status==="active"&&input.expiresOn<input.receiptDate)){
    throw new Error("Invalid GRN batch receipt or expired active lot");
  }
  requireAccess(input.authorizeWarehouse,input.orgId,input.warehouseId);
  if(typeof input.commitReceiptEvent!=="function")throw new Error("GRN requires same-transaction financial writer");
  const payload=eventPayload(input);
  return db.transaction(()=>{
    requireAccess(input.authorizeWarehouse,input.orgId,input.warehouseId);
    const replay=previous(db,input.orgId,input.eventId,"receipt",payload);
    if(replay)return replay;
    const rows=snapshot(db,input.orgId,input.warehouseId,input.productId);
    const source=rows.find(l=>l.id===input.lotId);
    if(rows.some(l=>l.batchCode===input.batchCode&&l.id!==input.lotId)){
      throw new Error("Batch code already belongs to another lot ID");
    }
    // A globally reused ID at another product cannot silently cross scope.
    const byId=db.query(`SELECT product_id, batch_code, expires_on,status
      FROM inv_lot_pilot_v1 WHERE org_id=? AND warehouse_id=? AND id=?`,
      [input.orgId,input.warehouseId,input.lotId]);
    if(byId.length>1||byId.length===1&&!source)throw new Error("Lot ID already used for another product");
    if(source&&(source.batchCode!==input.batchCode||source.expiresOn!==input.expiresOn||
      source.status!==input.status||source.productId!==input.productId||
      !Number.isSafeInteger(source.version)||source.version<1||
      !Number.isSafeInteger(source.onHandMilli)||source.onHandMilli<0||
      !Number.isSafeInteger(source.reservedMilli)||source.reservedMilli<0||
      source.reservedMilli>source.onHandMilli)){
      throw new Error("GRN lot immutable identity or stock state changed");
    }
    const next=BigInt(source?.onHandMilli??0)+BigInt(input.quantityMilli);
    if(next>BigInt(Number.MAX_SAFE_INTEGER))throw new Error("GRN lot quantity exceeds safe stock limit");
    requireFinancialChange(db,()=>input.commitReceiptEvent(db));
    if(source){
      db.exec(`UPDATE inv_lot_pilot_v1 SET on_hand_milli=?,version=?
        WHERE org_id=? AND warehouse_id=? AND id=? AND product_id=?
          AND version=? AND on_hand_milli=? AND reserved_milli=?
          AND batch_code=? AND expires_on=? AND status=?`,
        [Number(next),source.version+1,input.orgId,input.warehouseId,input.lotId,input.productId,
          source.version,source.onHandMilli,source.reservedMilli,
          source.batchCode,source.expiresOn,source.status]);
      if(changed(db)!==1)throw new Error("GRN lot CAS conflict; rolled back");
    }else{
      db.exec(`INSERT INTO inv_lot_pilot_v1
        (org_id,warehouse_id,id,product_id,batch_code,expires_on,status,on_hand_milli,reserved_milli,version)
        VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [input.orgId,input.warehouseId,input.lotId,input.productId,input.batchCode,
          input.expiresOn,input.status,input.quantityMilli,0,1]);
      if(changed(db)!==1)throw new Error("GRN lot insert failed");
    }
    const allocations=[{lotId:input.lotId,batchCode:input.batchCode,quantityMilli:input.quantityMilli}];
    saveEvent(db,input,"receipt",payload,allocations);
    return {disposition:"applied",eventId:input.eventId,eventType:"receipt",allocations};
  });
}
/** FEFO lot debit + host-owned financial sale callback in ONE SQLite transaction. */
export function sellPilotLotFefoSqlite(db:LotPilotDatabase,input:LotPilotSaleInput):LotPilotOutcome {
  if(!input||!cleanId(input.eventId)||!cleanId(input.productId)||
    !isoDay(input.businessDate)||!moneySafe(input.quantityMilli)){
    throw new Error("Invalid sale batch debit request");
  }
  requireAccess(input.authorizeWarehouse,input.orgId,input.warehouseId);
  if(typeof input.commitFinancialEvent!=="function"){
    throw new Error("FEFO sale requires same-transaction financial writer");
  }
  const payload=eventPayload(input);
  return db.transaction(()=>{
    requireAccess(input.authorizeWarehouse,input.orgId,input.warehouseId);
    const replay=previous(db,input.orgId,input.eventId,"sale",payload);
    if(replay)return replay;
    const lots=snapshot(db,input.orgId,input.warehouseId,input.productId);
    for(const lot of lots){
      if(!Number.isSafeInteger(lot.version)||lot.version<1||lot.version>=Number.MAX_SAFE_INTEGER){
        throw new Error("Unsafe lot revision");
      }
    }
    const picks=planFefoLotAllocations({
      orgId:input.orgId,warehouseId:input.warehouseId,productId:input.productId,
      asOfDate:input.businessDate,quantityMilli:input.quantityMilli,lots,
    });
    const byId=new Map(lots.map(l=>[l.id,l]));
    const allocations=picks.map(p=>{
      const lot=byId.get(p.batchId)!;
      return {lotId:lot.id,batchCode:lot.batchCode,quantityMilli:p.quantityMilli};
    });
    requireFinancialChange(db,()=>input.commitFinancialEvent(db,allocations));
    for(const pick of picks){
      const lot=byId.get(pick.batchId)!;
      const next=lot.onHandMilli-pick.quantityMilli;
      if(!Number.isSafeInteger(next)||next<lot.reservedMilli){
        throw new Error("Cannot consume reserved or insufficient lot stock");
      }
      db.exec(`UPDATE inv_lot_pilot_v1 SET on_hand_milli=?,version=?
        WHERE org_id=? AND warehouse_id=? AND id=? AND product_id=?
          AND version=? AND on_hand_milli=? AND reserved_milli=?
          AND batch_code=? AND expires_on=? AND status='active'`,
        [next,lot.version+1,lot.orgId,lot.warehouseId,lot.id,lot.productId,
         lot.version,lot.onHandMilli,lot.reservedMilli,lot.batchCode,lot.expiresOn]);
      if(changed(db)!==1)throw new Error("Sale lot CAS conflict; entire sale rolled back");
    }
    saveEvent(db,input,"sale",payload,allocations);
    return {disposition:"applied",eventId:input.eventId,eventType:"sale",allocations};
  });
}
