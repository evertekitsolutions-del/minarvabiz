import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),databaseRequire=createRequire(new URL("../../../database/package.json",import.meta.url));
const ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(
  ts.transpileModule(fs.readFileSync(file,"utf8"),{
    fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText,file,
);
const lot=require("../lot-stock-sqlite-pilot.ts");
const returns=require("../lot-return-sqlite-pilot.ts");
const qc=require("../lot-quarantine-qc-sqlite-pilot.ts");
const SQL=await databaseRequire("sql.js/dist/sql-asm.js")();
function sqlite(){
  const raw=new SQL.Database();
  const db={
    exec(sql,params=[]){raw.run(sql,params);},
    query(sql,params=[]){
      const stmt=raw.prepare(sql);
      try{stmt.bind(params);const rows=[];while(stmt.step())rows.push(stmt.getAsObject());return rows;}
      finally{stmt.free();}
    },
    transaction(fn){raw.run("BEGIN IMMEDIATE");
      try{const result=fn();raw.run("COMMIT");return result;}
      catch(error){raw.run("ROLLBACK");throw error;}
    },
  };
  lot.initializeLotStockPilotSqlite(db);
  db.exec("CREATE TABLE pilot_audit_finance (id TEXT PRIMARY KEY,event_type TEXT NOT NULL)");
  return db;
}
const warehouse=(org,wh)=>{if(org!=="org1"||wh!=="w1")throw new Error("warehouse denied");};
const inspect=(org,wh,kind)=>{
  if(org!=="org1"||wh!=="w1"||!["release","reject"].includes(kind))throw new Error("QC denied");
};
function seed(db,expiry="2027-01-01"){
  lot.receivePilotLotSqlite(db,{
    orgId:"org1",warehouseId:"w1",eventId:"grn1",lotId:"lot1",
    productId:"sku1",batchCode:"B1",expiresOn:expiry,
    receiptDate:"2026-10-22",quantityMilli:5000,status:"active",
    authorizeWarehouse:warehouse,
    commitReceiptEvent:tx=>tx.exec("INSERT INTO pilot_audit_finance VALUES(?,?)",["grn1","receipt"]),
  });
  lot.sellPilotLotFefoSqlite(db,{
    orgId:"org1",warehouseId:"w1",eventId:"sale1",productId:"sku1",
    businessDate:"2026-10-23",quantityMilli:3500,authorizeWarehouse:warehouse,
    commitFinancialEvent:tx=>tx.exec("INSERT INTO pilot_audit_finance VALUES(?,?)",["sale1","sale"]),
  });
  returns.acceptPilotLotReturnSqlite(db,{
    orgId:"org1",warehouseId:"w1",returnEventId:"ret1",saleEventId:"sale1",
    productId:"sku1",returnDate:"2026-10-24",quantityMilli:2000,
    authorizeWarehouse:warehouse,
    commitFinancialReturn:tx=>tx.exec("INSERT INTO pilot_audit_finance VALUES(?,?)",["ret1","return"]),
  });
}
function decision(overrides={}){
  return {
    orgId:"org1",warehouseId:"w1",inspectionEventId:"qc1",
    returnEventId:"ret1",lotId:"lot1",decision:"release",inspectionDate:"2026-10-25",
    authorizeWarehouse:warehouse,authorizeInspection:inspect,
    commitInventoryReview:tx=>tx.exec("INSERT INTO pilot_audit_finance VALUES(?,?)",["qc1","qc"]),
    ...overrides,
  };
}
const snapshot=db=>JSON.stringify({
  lot:db.query("SELECT id,on_hand_milli,reserved_milli,status,version FROM inv_lot_pilot_v1"),
  quarantined:db.query("SELECT return_event_id,lot_id,quantity_milli,status FROM inv_lot_quarantine_pilot_v1"),
  events:db.query("SELECT event_id,event_type FROM inv_lot_event_pilot_v1 ORDER BY event_id"),
  ledger:db.query("SELECT * FROM pilot_audit_finance ORDER BY id"),
});
test("QC release credits exactly inspected quantity to original versioned lot inside SQLite transaction",()=>{
  const db=sqlite();seed(db);
  const before=db.query("SELECT on_hand_milli,version FROM inv_lot_pilot_v1")[0];
  assert.equal(before.on_hand_milli,1500);
  const out=qc.decidePilotLotQuarantineSqlite(db,decision());
  assert.equal(out.disposition,"applied");
  assert.equal(out.decision,"release");
  assert.equal(out.allocation.quantityMilli,2000);
  const after=db.query("SELECT on_hand_milli,version FROM inv_lot_pilot_v1")[0];
  assert.deepEqual([after.on_hand_milli,after.version],[3500,3]);
  assert.equal(db.query("SELECT status FROM inv_lot_quarantine_pilot_v1")[0].status,"released");
  assert.equal(db.query("SELECT event_type FROM inv_lot_event_pilot_v1 WHERE event_id='qc1'")[0].event_type,"qc");
  const originalReturn=returns.acceptPilotLotReturnSqlite(db,{
    orgId:"org1",warehouseId:"w1",returnEventId:"ret1",saleEventId:"sale1",
    productId:"sku1",returnDate:"2026-10-24",quantityMilli:2000,authorizeWarehouse:warehouse,
    commitFinancialReturn:()=>{throw new Error("replay refund must not execute");},
  });
  assert.equal(originalReturn.disposition,"already_applied");
});
test("QC reject is a terminal custody decision with NO stock credit even after expiry",()=>{
 const db=sqlite();seed(db,"2026-11-01");
 const before=db.query("SELECT on_hand_milli,version FROM inv_lot_pilot_v1")[0];
 const out=qc.decidePilotLotQuarantineSqlite(db,decision({
   decision:"reject",inspectionDate:"2026-12-20",
 }));
 assert.equal(out.decision,"reject");
 assert.deepEqual(db.query("SELECT on_hand_milli,version FROM inv_lot_pilot_v1")[0],before);
 assert.equal(db.query("SELECT status FROM inv_lot_quarantine_pilot_v1")[0].status,"rejected");
});
test("idempotent replay never credits again or re-runs inventory finance callback",()=>{
 const db=sqlite();seed(db);qc.decidePilotLotQuarantineSqlite(db,decision());
 const before=snapshot(db);
 const again=qc.decidePilotLotQuarantineSqlite(db,decision({
   commitInventoryReview:()=>{throw new Error("duplicate inventory event");},
 }));
 assert.equal(again.disposition,"already_applied");
 assert.equal(snapshot(db),before);
 assert.throws(()=>qc.decidePilotLotQuarantineSqlite(db,decision({
   decision:"reject",
 })),/already used for a different transaction/);
 assert.throws(()=>qc.decidePilotLotQuarantineSqlite(db,decision({
   inspectionEventId:"qc2",commitInventoryReview:()=>{},
 })),/already inspected/);
 assert.equal(snapshot(db),before);
});
test("blocked and expired original lots cannot be released; reject remains available",()=>{
 const db=sqlite();seed(db,"2026-11-01");
 const before=snapshot(db);
 assert.throws(()=>qc.decidePilotLotQuarantineSqlite(db,decision({
   inspectionDate:"2026-11-02",
 })),/Expired, blocked/);
 assert.equal(snapshot(db),before);
 db.exec("UPDATE inv_lot_pilot_v1 SET status='blocked' WHERE id='lot1'");
 assert.throws(()=>qc.decidePilotLotQuarantineSqlite(db,decision()),/Expired, blocked/);
 assert.equal(db.query("SELECT status FROM inv_lot_quarantine_pilot_v1")[0].status,"quarantined");
 const rejected=qc.decidePilotLotQuarantineSqlite(db,decision({decision:"reject"}));
 assert.equal(rejected.decision,"reject");
});
test("failed, no-op or partially conflicting inspection callbacks roll back all SQLite writes",()=>{
 const db=sqlite();seed(db);const original=snapshot(db);
 assert.throws(()=>qc.decidePilotLotQuarantineSqlite(db,decision({
   commitInventoryReview:()=>{},
 })),/did not commit a SQL change/);
 assert.equal(snapshot(db),original);
 assert.throws(()=>qc.decidePilotLotQuarantineSqlite(db,decision({
   commitInventoryReview:tx=>{
     tx.exec("INSERT INTO pilot_audit_finance VALUES(?,?)",["qc1","qc"]);
     throw new Error("inventory posting failed");
   },
 })),/inventory posting failed/);
 assert.equal(snapshot(db),original);
 const sabotage={...db,exec(sql,params){
   if(sql.includes("UPDATE inv_lot_quarantine_pilot_v1")){
     return db.exec(sql+" AND 1=0",params);
   }
   return db.exec(sql,params);
 }};
 assert.throws(()=>qc.decidePilotLotQuarantineSqlite(sabotage,decision()),/QC custody CAS conflict/);
 assert.equal(snapshot(db),original);
});
test("wrong scope, unauthorized QC, invalid date and missing custody fail closed",()=>{
 const db=sqlite();seed(db);const prior=snapshot(db);
 for(const [changes,expected] of [
   [{orgId:"else"},/warehouse denied/],
   [{warehouseId:"else"},/warehouse denied/],
   [{returnEventId:"missing"},/custody row missing/],
   [{lotId:"not-sold"},/custody row missing/],
   [{inspectionDate:"2026-10-23"},/precedes original return/],
   [{inspectionDate:"2026-02-30"},/Invalid batch/],
   [{inspectionEventId:"ret1"},/already used for a different transaction/],
   [{authorizeInspection:undefined},/QC authorization/],
   [{commitInventoryReview:undefined},/inventory review writer/],
   [{authorizeInspection:()=>{throw new Error("QC role denied");}},/QC role denied/],
 ]){
   assert.throws(()=>qc.decidePilotLotQuarantineSqlite(db,decision(changes)),expected);
 }
 assert.equal(snapshot(db),prior);
});
test("QC after fully returned lot keeps positive physical quantity without reservations mismatch",()=>{
 const db=sqlite();seed(db);
 const outcome=qc.decidePilotLotQuarantineSqlite(db,decision());
 assert.equal(outcome.allocation.batchCode,"B1");
 assert.equal(db.query("SELECT reserved_milli FROM inv_lot_pilot_v1")[0].reserved_milli,0);
 assert.equal(db.query("SELECT on_hand_milli FROM inv_lot_pilot_v1")[0].on_hand_milli,3500);
});
test("new domain export and documentation explicitly state pilot boundaries",()=>{
 const idx=fs.readFileSync(new URL("../index.ts",import.meta.url),"utf8");
 const docs=fs.readFileSync(new URL("../../../../docs/INV_005_SQLITE_QUARANTINE_QC.md",import.meta.url),"utf8");
 assert.match(idx,/export \* from "\.\/lot-quarantine-qc-sqlite-pilot";/);
 assert.match(docs,/NOT production POS/);
 assert.match(docs,/same SQLite transaction/);
});
