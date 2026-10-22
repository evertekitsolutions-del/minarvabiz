/**
 * INV-005 pilot: authorized QC decision for one returned batch allocation.
 *
 * "reject" disposes quarantine without stock credit; "release" explicitly
 * transfers inspected goods back to the isolated versioned lot ledger.
 * A trusted host-owned inventory/finance callback runs in the same SQLite
 * transaction. NEVER connect to live POS/WMS or invoke from renderer authority.
 */
import type {
  LotPilotAllocation,
  LotPilotDatabase,
  AuthorizeLotWarehouse,
} from "./lot-stock-sqlite-pilot";

export interface LotPilotQcInput {
  readonly orgId: string;
  readonly warehouseId: string;
  readonly inspectionEventId: string;
  readonly returnEventId: string;
  readonly lotId: string;
  readonly inspectionDate: string;
  readonly decision: "release" | "reject";
  readonly authorizeWarehouse: AuthorizeLotWarehouse;
  /** Separate trusted QC role gate, not a renderer-selected boolean. */
  readonly authorizeInspection: (orgId:string,warehouseId:string,decision:"release"|"reject")=>void;
  readonly commitInventoryReview: (
    db:LotPilotDatabase,
    decision:"release"|"reject",
    allocation:LotPilotAllocation,
  )=>void;
}
export interface LotPilotQcOutcome {
  readonly disposition: "applied" | "already_applied";
  readonly inspectionEventId: string;
  readonly returnEventId: string;
  readonly decision: "release" | "reject";
  readonly allocation: LotPilotAllocation;
  readonly source: "pilot_quarantine";
}
const id=(v:unknown):v is string=>
  typeof v==="string"&&v.length>0&&v.length<=128&&v.trim()===v;
function day(v:unknown):v is string {
  if(typeof v!=="string"||!/^20\d{2}-\d{2}-\d{2}$/.test(v))return false;
  const d=new Date(v+"T00:00:00.000Z");
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
}
function oneChange(db:LotPilotDatabase,label:string):void{
  const n=Number(db.query("SELECT changes() AS affected")[0]?.affected);
  if(n!==1)throw new Error(label+" CAS conflict; transaction rolled back");
}
function checkAccess(input:LotPilotQcInput):void {
  if(!id(input.orgId)||!id(input.warehouseId)||
     typeof input.authorizeWarehouse!=="function"||
     typeof input.authorizeInspection!=="function"){
    throw new Error("Trusted warehouse and QC authorization are required");
  }
  input.authorizeWarehouse(input.orgId,input.warehouseId);
  input.authorizeInspection(input.orgId,input.warehouseId,input.decision);
}
function content(input:LotPilotQcInput):string{
  return JSON.stringify({
    orgId:input.orgId,warehouseId:input.warehouseId,
    inspectionEventId:input.inspectionEventId,
    returnEventId:input.returnEventId,lotId:input.lotId,
    inspectionDate:input.inspectionDate,decision:input.decision,
  });
}
function parseOneAllocation(raw:unknown):LotPilotAllocation {
  let value:unknown;
  try{value=JSON.parse(String(raw));}catch{throw new Error("Corrupt QC allocation JSON");}
  if(!Array.isArray(value)||value.length!==1)throw new Error("Invalid QC allocation count");
  const a=value[0] as Record<string,unknown>;
  if(!a||!id(a.lotId)||!id(a.batchCode)||
     typeof a.quantityMilli!=="number"||!Number.isSafeInteger(a.quantityMilli)||
     a.quantityMilli<=0||Object.keys(a).some(k=>!["lotId","batchCode","quantityMilli"].includes(k))){
    throw new Error("Invalid QC allocation");
  }
  return {lotId:a.lotId,batchCode:a.batchCode,quantityMilli:a.quantityMilli};
}
export function decidePilotLotQuarantineSqlite(
  db:LotPilotDatabase,input:LotPilotQcInput,
):LotPilotQcOutcome {
  if(!input||!id(input.inspectionEventId)||!id(input.returnEventId)||
     !id(input.lotId)||input.inspectionEventId===input.returnEventId||
     !day(input.inspectionDate)||!["release","reject"].includes(input.decision)){
    throw new Error("Invalid batch quarantine QC decision");
  }
  checkAccess(input);
  if(typeof input.commitInventoryReview!=="function"){
    throw new Error("QC requires a trusted same-transaction inventory review writer");
  }
  const payload=content(input);
  return db.transaction(()=>{
    checkAccess(input);
    const prior=db.query(
      `SELECT event_type,warehouse_id,payload_json,allocations_json
        FROM inv_lot_event_pilot_v1 WHERE org_id=? AND event_id=?`,
      [input.orgId,input.inspectionEventId],
    );
    if(prior.length>1)throw new Error("Duplicate persisted QC event ID");
    const returned=db.query(
      `SELECT q.product_id,q.warehouse_id,q.batch_code,q.quantity_milli,q.status,
              r.sale_event_id
         FROM inv_lot_quarantine_pilot_v1 q
         JOIN inv_lot_return_pilot_v1 r
           ON r.org_id=q.org_id AND r.return_event_id=q.return_event_id
        WHERE q.org_id=? AND q.return_event_id=? AND q.lot_id=?`,
      [input.orgId,input.returnEventId,input.lotId],
    );
    if(returned.length!==1)throw new Error("Quarantine custody row missing or invalid");
    const row=returned[0];
    if(row.warehouse_id!==input.warehouseId||!id(row.product_id)||!id(row.batch_code)||
      !Number.isSafeInteger(Number(row.quantity_milli))||Number(row.quantity_milli)<=0){
      throw new Error("Quarantine custody does not belong to authorized warehouse");
    }
    const allocation:LotPilotAllocation={
      lotId:input.lotId,batchCode:String(row.batch_code),
      quantityMilli:Number(row.quantity_milli),
    };
    if(prior.length){
      const existing=prior[0];
      if(existing.event_type!=="qc"||existing.warehouse_id!==input.warehouseId||
         existing.payload_json!==payload){
        throw new Error("QC event ID already used for a different transaction");
      }
      const stored=parseOneAllocation(existing.allocations_json);
      if(JSON.stringify(stored)!==JSON.stringify(allocation)||
         row.status!==(input.decision==="release"?"released":"rejected")){
        throw new Error("QC replay custody state or quantity changed");
      }
      return {
        disposition:"already_applied",inspectionEventId:input.inspectionEventId,
        returnEventId:input.returnEventId,decision:input.decision,
        allocation,source:"pilot_quarantine",
      };
    }
    if(row.status!=="quarantined")throw new Error("Returned lot already inspected; cannot decide twice");
    const sourceReturn=db.query(
      `SELECT event_type,payload_json
         FROM inv_lot_event_pilot_v1 WHERE org_id=? AND event_id=?`,
      [input.orgId,input.returnEventId],
    );
    if(sourceReturn.length!==1||sourceReturn[0].event_type!=="return"){
      throw new Error("Original return event unavailable");
    }
    let priorReturn:Record<string,unknown>;
    try{priorReturn=JSON.parse(String(sourceReturn[0].payload_json));}catch{
      throw new Error("Original return payload corrupted");
    }
    if(!priorReturn||priorReturn.orgId!==input.orgId||
       priorReturn.warehouseId!==input.warehouseId||
       !day(priorReturn.returnDate)||input.inspectionDate<priorReturn.returnDate){
      throw new Error("QC date precedes original return or return authority changed");
    }
    let lot:null|Record<string,unknown>=null;
    if(input.decision==="release"){
      const rows=db.query(
        `SELECT product_id,batch_code,expires_on,status,
                on_hand_milli,reserved_milli,version
           FROM inv_lot_pilot_v1
          WHERE org_id=? AND warehouse_id=? AND id=?`,
        [input.orgId,input.warehouseId,input.lotId],
      );
      if(rows.length!==1)throw new Error("Original sale lot missing; cannot restore stock");
      lot=rows[0];
      if(lot.product_id!==row.product_id||lot.batch_code!==row.batch_code||
         lot.status!=="active"||!day(lot.expires_on)||
         lot.expires_on<input.inspectionDate){
        throw new Error("Expired, blocked, or mismatched batch cannot be released to stock");
      }
      if(!Number.isSafeInteger(Number(lot.on_hand_milli))||Number(lot.on_hand_milli)<0||
         !Number.isSafeInteger(Number(lot.reserved_milli))||
         Number(lot.reserved_milli)<0||Number(lot.reserved_milli)>Number(lot.on_hand_milli)||
         !Number.isSafeInteger(Number(lot.version))||Number(lot.version)<1||
         Number(lot.version)>=Number.MAX_SAFE_INTEGER||
         BigInt(Number(lot.on_hand_milli))+BigInt(allocation.quantityMilli)>BigInt(Number.MAX_SAFE_INTEGER)){
        throw new Error("Invalid source lot version or amount; cannot release");
      }
    }
    const previous=Number(db.query("SELECT total_changes() AS n")[0]?.n);
    if(!Number.isSafeInteger(previous))throw new Error("QC SQL change counter unavailable");
    input.commitInventoryReview(db,input.decision,allocation);
    const updated=Number(db.query("SELECT total_changes() AS n")[0]?.n);
    if(!Number.isSafeInteger(updated)||updated<=previous){
      throw new Error("Trusted QC review writer did not commit a SQL change");
    }
    if(lot){
      db.exec(
        `UPDATE inv_lot_pilot_v1 SET on_hand_milli=?,version=?
          WHERE org_id=? AND warehouse_id=? AND id=? AND product_id=?
            AND batch_code=? AND expires_on=? AND status='active'
            AND version=? AND on_hand_milli=? AND reserved_milli=?`,
        [Number(lot.on_hand_milli)+allocation.quantityMilli,Number(lot.version)+1,
         input.orgId,input.warehouseId,input.lotId,row.product_id,
         row.batch_code,lot.expires_on,lot.version,lot.on_hand_milli,lot.reserved_milli],
      );
      oneChange(db,"QC release lot");
    }
    const next=input.decision==="release"?"released":"rejected";
    db.exec(
      `UPDATE inv_lot_quarantine_pilot_v1 SET status=?
         WHERE org_id=? AND return_event_id=? AND lot_id=?
           AND warehouse_id=? AND batch_code=? AND quantity_milli=?
           AND status='quarantined'`,
      [next,input.orgId,input.returnEventId,input.lotId,
       input.warehouseId,row.batch_code,allocation.quantityMilli],
    );
    oneChange(db,"QC custody");
    db.exec(
      `INSERT INTO inv_lot_event_pilot_v1
         (org_id,event_id,event_type,warehouse_id,payload_json,allocations_json)
         VALUES(?,?,?,?,?,?)`,
      [input.orgId,input.inspectionEventId,"qc",input.warehouseId,
       payload,JSON.stringify([allocation])],
    );
    oneChange(db,"QC event");
    return {
      disposition:"applied",inspectionEventId:input.inspectionEventId,
      returnEventId:input.returnEventId,decision:input.decision,
      allocation,source:"pilot_quarantine",
    };
  });
}
