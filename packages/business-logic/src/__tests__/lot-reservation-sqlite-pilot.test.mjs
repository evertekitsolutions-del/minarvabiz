import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const databaseRequire=createRequire(new URL("../../../database/package.json",import.meta.url));
const ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(
  ts.transpileModule(fs.readFileSync(file,"utf8"),{
    fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText,file,
);
const stock=require("../lot-stock-sqlite-pilot.ts");
const hold=require("../lot-reservation-sqlite-pilot.ts");
const returns=require("../lot-return-sqlite-pilot.ts");
const SQL=await databaseRequire("sql.js/dist/sql-asm.js")();
function connection(){
  const raw=new SQL.Database();
  const db={
    exec(sql,params=[]){raw.run(sql,params);},
    query(sql,params=[]){
      const stmt=raw.prepare(sql);
      try{stmt.bind(params);const rows=[];while(stmt.step())rows.push(stmt.getAsObject());return rows;}
      finally{stmt.free();}
    },
    transaction(fn){
      raw.run("BEGIN IMMEDIATE");
      try{const result=fn();raw.run("COMMIT");return result;}
      catch(error){raw.run("ROLLBACK");throw error;}
    },
  };
  stock.initializeLotStockPilotSqlite(db);
  db.exec("CREATE TABLE pilot_reservation_sale_finance (event_id TEXT PRIMARY KEY)");
  db.exec("CREATE TABLE pilot_reservation_grn_finance (event_id TEXT PRIMARY KEY)");
  db.exec("CREATE TABLE pilot_reservation_refund_finance (event_id TEXT PRIMARY KEY)");
  return db;
}
const checkWarehouse=(org,warehouse)=>{
  if(org!=="org1"||warehouse!=="wh1")throw new Error("warehouse unauthorized");
};
function grn(eventId,lotId,batchCode,expiresOn,quantityMilli){
  return {orgId:"org1",warehouseId:"wh1",eventId,lotId,productId:"sku1",
    batchCode,expiresOn,receiptDate:"2026-10-22",quantityMilli,status:"active",
    authorizeWarehouse:checkWarehouse,
    commitReceiptEvent:db=>db.exec("INSERT INTO pilot_reservation_grn_finance VALUES(?)",[eventId])};
}
function seed(db){
  stock.receivePilotLotSqlite(db,grn("grn1","lot1","OLD","2026-11-01",2000));
  stock.receivePilotLotSqlite(db,grn("grn2","lot2","NEW","2027-02-01",5000));
}
function reserve(overrides={}){
  return {orgId:"org1",warehouseId:"wh1",reservationId:"hold1",
    productId:"sku1",businessDate:"2026-10-23",quantityMilli:3500,
    authorizeWarehouse:checkWarehouse,...overrides};
}
function cancel(overrides={}){
  return {orgId:"org1",warehouseId:"wh1",reservationId:"hold1",
    cancellationEventId:"cancel1",authorizeWarehouse:checkWarehouse,...overrides};
}
function commit(overrides={}){
  return {orgId:"org1",warehouseId:"wh1",reservationId:"hold1",
    saleEventId:"sale1",businessDate:"2026-10-24",authorizeWarehouse:checkWarehouse,
    commitFinancialEvent:db=>db.exec("INSERT INTO pilot_reservation_sale_finance VALUES(?)",["sale1"]),
    ...overrides};
}
function lotRows(db){return db.query("SELECT id,on_hand_milli,reserved_milli,version,status FROM inv_lot_pilot_v1 ORDER BY id");}
function allState(db){return JSON.stringify({
  lots:lotRows(db),
  events:db.query("SELECT event_type,event_id,payload_json,allocations_json FROM inv_lot_event_pilot_v1 ORDER BY event_id"),
  holds:db.query("SELECT * FROM inv_lot_reservation_pilot_v1 ORDER BY reservation_id"),
  finance:db.query("SELECT * FROM pilot_reservation_sale_finance"),
});}
test("FEFO reserve holds nearest-expiry batches with integer milli-unit stock CAS",()=>{
  const db=connection();seed(db);
  const applied=hold.reservePilotFefoLotsSqlite(db,reserve());
  assert.equal(applied.disposition,"applied");
  assert.deepEqual(applied.allocations.map(a=>[a.lotId,a.quantityMilli]),[["lot1",2000],["lot2",1500]]);
  assert.deepEqual(lotRows(db).map(x=>[x.id,x.on_hand_milli,x.reserved_milli,x.version]),[
    ["lot1",2000,2000,2],["lot2",5000,1500,2],
  ]);
  const before=allState(db);
  const replay=hold.reservePilotFefoLotsSqlite(db,reserve());
  assert.equal(replay.disposition,"already_applied");
  assert.equal(allState(db),before);
  assert.throws(()=>hold.reservePilotFefoLotsSqlite(db,reserve({quantityMilli:1000})),/conflicts/);
  assert.equal(allState(db),before);
});
test("held stock reduces free FEFO sales; independent checkout cannot take reserved quantities",()=>{
  const db=connection();seed(db);
  hold.reservePilotFefoLotsSqlite(db,reserve());
  assert.throws(()=>stock.sellPilotLotFefoSqlite(db,{
    orgId:"org1",warehouseId:"wh1",eventId:"sale-other",productId:"sku1",
    businessDate:"2026-10-24",quantityMilli:4000,authorizeWarehouse:checkWarehouse,
    commitFinancialEvent:()=>{throw new Error("must not charge");},
  }),/Insufficient saleable lot stock/);
  assert.deepEqual(db.query("SELECT * FROM pilot_reservation_sale_finance"),[]);
  assert.equal(lotRows(db).reduce((a,l)=>a+l.reserved_milli,0),3500);
});
test("cancelling a hold returns only reserved stock, never physical on-hand, and is idempotent",()=>{
  const db=connection();seed(db);hold.reservePilotFefoLotsSqlite(db,reserve());
  const result=hold.cancelPilotFefoReservationSqlite(db,cancel());
  assert.equal(result.status,"cancelled");
  assert.deepEqual(lotRows(db).map(l=>[l.on_hand_milli,l.reserved_milli]),[[2000,0],[5000,0]]);
  const before=allState(db);
  assert.equal(hold.cancelPilotFefoReservationSqlite(db,cancel()).disposition,"already_applied");
  assert.equal(allState(db),before);
  assert.throws(()=>hold.commitPilotFefoReservationSaleSqlite(db,commit()),/no longer available/);
  assert.throws(()=>hold.cancelPilotFefoReservationSqlite(db,cancel({cancellationEventId:"cancel2"})),/already been settled/);
  assert.equal(allState(db),before);
});
test("one SQLite transaction commits financial sale + reserved stock debit + event exactly once",()=>{
  const db=connection();seed(db);hold.reservePilotFefoLotsSqlite(db,reserve());
  const outcome=hold.commitPilotFefoReservationSaleSqlite(db,commit());
  assert.equal(outcome.status,"committed");
  assert.deepEqual(lotRows(db).map(l=>[l.on_hand_milli,l.reserved_milli,l.version]),[[0,0,3],[3500,0,3]]);
  assert.deepEqual(db.query("SELECT event_id FROM pilot_reservation_sale_finance"),[{event_id:"sale1"}]);
  const before=allState(db);
  assert.equal(hold.commitPilotFefoReservationSaleSqlite(db,commit({
    commitFinancialEvent:()=>{throw new Error("no duplicate charge");},
  })).disposition,"already_applied");
  assert.equal(allState(db),before);
  assert.throws(()=>hold.cancelPilotFefoReservationSqlite(db,cancel()),/already been settled/);
  assert.throws(()=>hold.commitPilotFefoReservationSaleSqlite(db,commit({
    saleEventId:"sale2",
    commitFinancialEvent:()=>{},
  })),/no longer available/);
  assert.equal(allState(db),before);
});
test("settled reservation sale produces genuine original lot provenance for existing refund quarantine workflow",()=>{
 const db=connection();seed(db);hold.reservePilotFefoLotsSqlite(db,reserve());
 hold.commitPilotFefoReservationSaleSqlite(db,commit());
 const res=returns.acceptPilotLotReturnSqlite(db,{
   orgId:"org1",warehouseId:"wh1",returnEventId:"return1",
   saleEventId:"sale1",productId:"sku1",returnDate:"2026-10-25",quantityMilli:2400,
   authorizeWarehouse:checkWarehouse,
   commitFinancialReturn:tx=>tx.exec("INSERT INTO pilot_reservation_refund_finance VALUES(?)",["return1"]),
 });
 assert.equal(res.disposition,"applied");
 assert.deepEqual(res.allocations.map(a=>[a.lotId,a.quantityMilli]),[["lot1",2000],["lot2",400]]);
 assert.equal(db.query("SELECT COUNT(*) AS n FROM inv_lot_quarantine_pilot_v1")[0].n,2);
 assert.deepEqual(lotRows(db).map(l=>[l.on_hand_milli,l.reserved_milli]),[[0,0],[3500,0]]);
});
test("failed or no-op financial callback rolls back lot and reservation state",()=>{
  const db=connection();seed(db);hold.reservePilotFefoLotsSqlite(db,reserve());
  const before=allState(db);
  assert.throws(()=>hold.commitPilotFefoReservationSaleSqlite(db,commit({
    commitFinancialEvent:()=>{},
  })),/made no SQL change/);
  assert.equal(allState(db),before);
  assert.throws(()=>hold.commitPilotFefoReservationSaleSqlite(db,commit({
    commitFinancialEvent:tx=>{
      tx.exec("INSERT INTO pilot_reservation_sale_finance VALUES(?)",["sale1"]);
      throw new Error("journal balancing rejected");
    },
  })),/journal balancing rejected/);
  assert.equal(allState(db),before);
});
test("second-lot CAS sabotage rolls back financial sale and all first-lot debits",()=>{
  const db=connection();seed(db);hold.reservePilotFefoLotsSqlite(db,reserve());
  const before=allState(db);
  let updates=0;
  const sabotage={...db,exec(sql,params){
    if(sql.includes("UPDATE inv_lot_pilot_v1") && ++updates===2){
      return db.exec(sql+" AND 1=0",params);
    }
    return db.exec(sql,params);
  }};
  assert.throws(()=>hold.commitPilotFefoReservationSaleSqlite(sabotage,commit()),/Reservation lot CAS conflict/);
  assert.equal(allState(db),before);
});
test("expired or blocked held lots cannot settle; cancellation releases the hold",()=>{
  const db=connection();seed(db);hold.reservePilotFefoLotsSqlite(db,reserve());
  const before=allState(db);
  assert.throws(()=>hold.commitPilotFefoReservationSaleSqlite(db,commit({
    businessDate:"2026-11-02",
  })),/unavailable, blocked, expired/);
  assert.equal(allState(db),before);
  db.exec("UPDATE inv_lot_pilot_v1 SET status='blocked' WHERE id='lot1'");
  assert.throws(()=>hold.commitPilotFefoReservationSaleSqlite(db,commit()),/unavailable, blocked, expired/);
  hold.cancelPilotFefoReservationSqlite(db,cancel());
  assert.equal(lotRows(db).reduce((a,l)=>a+l.reserved_milli,0),0);
});
test("invalid dates, cross-tenant access, insufficient stock and reused IDs fail closed",()=>{
  const db=connection();seed(db);const before=allState(db);
  assert.throws(()=>hold.reservePilotFefoLotsSqlite(db,reserve({orgId:"org2"})),/unauthorized/);
  assert.throws(()=>hold.reservePilotFefoLotsSqlite(db,reserve({warehouseId:"wh2"})),/unauthorized/);
  assert.throws(()=>hold.reservePilotFefoLotsSqlite(db,reserve({businessDate:"2026-02-30"})),/Invalid FEFO/);
  assert.throws(()=>hold.reservePilotFefoLotsSqlite(db,reserve({quantityMilli:0})),/Invalid FEFO/);
  assert.throws(()=>hold.reservePilotFefoLotsSqlite(db,reserve({quantityMilli:7001})),/Insufficient saleable/);
  assert.equal(allState(db),before);
  hold.reservePilotFefoLotsSqlite(db,reserve());
  assert.throws(()=>hold.cancelPilotFefoReservationSqlite(db,cancel({cancellationEventId:"grn1"})),/already used/);
  assert.throws(()=>hold.commitPilotFefoReservationSaleSqlite(db,commit({saleEventId:"grn1"})),/already used/);
  assert.throws(()=>hold.commitPilotFefoReservationSaleSqlite(db,commit({businessDate:"2026-10-22"})),/cannot precede/);
});
test("barrel export, opt-in schema and release boundaries",()=>{
 const idx=fs.readFileSync(new URL("../index.ts",import.meta.url),"utf8");
 const docs=fs.readFileSync(new URL("../../../../docs/INV_005_SQLITE_FEFO_RESERVATIONS.md",import.meta.url),"utf8");
 assert.match(idx,/export \* from "\.\/lot-reservation-sqlite-pilot";/);
 assert.match(docs,/NOT production POS/);
 assert.match(docs,/no production migration/);
});
