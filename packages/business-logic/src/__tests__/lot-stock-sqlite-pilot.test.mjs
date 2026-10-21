import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const databaseRequire=createRequire(new URL("../../../database/package.json",import.meta.url));
const ts=require("typescript");
require.extensions[".ts"]=(mod,filename)=>mod._compile(
  ts.transpileModule(fs.readFileSync(filename,"utf8"),{
    fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText,filename,
);
const pilot=require("../lot-stock-sqlite-pilot.ts");
const SQL=await databaseRequire("sql.js/dist/sql-asm.js")();
function dbFactory(init=true){
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
      try{const out=fn();raw.run("COMMIT");return out;}
      catch(err){raw.run("ROLLBACK");throw err;}
    },
  };
  if(init)pilot.initializeLotStockPilotSqlite(db);
  db.exec("CREATE TABLE pilot_grn_finance (event_id TEXT PRIMARY KEY,amount_milli INTEGER NOT NULL)");
  db.exec("CREATE TABLE pilot_sale_finance (event_id TEXT PRIMARY KEY,amount_milli INTEGER NOT NULL)");
  return db;
}
const authorizeWarehouse=(org,warehouse)=>{
  if(org!=="org1"||warehouse!=="w1")throw new Error("warehouse access denied");
};
function receipt(overrides={}){
  return {
    orgId:"org1",warehouseId:"w1",eventId:"grn-1",lotId:"lot1",
    productId:"sku1",batchCode:"B-01",expiresOn:"2027-01-01",
    receiptDate:"2026-10-22",quantityMilli:5000,status:"active",
    authorizeWarehouse,
    commitReceiptEvent(db){
      db.exec("INSERT INTO pilot_grn_finance (event_id,amount_milli) VALUES (?,?)",
        [this?.eventId??"grn-1",5000]);
    },
    ...overrides,
  };
}
function sale(overrides={}){
  return {
    orgId:"org1",warehouseId:"w1",eventId:"sale-1",productId:"sku1",
    businessDate:"2026-10-23",quantityMilli:3500,authorizeWarehouse,
    commitFinancialEvent(db){
      db.exec("INSERT INTO pilot_sale_finance (event_id,amount_milli) VALUES (?,?)",["sale-1",3500]);
    },
    ...overrides,
  };
}
function lots(db){return db.query("SELECT id,product_id,expires_on,status,on_hand_milli,reserved_milli,version FROM inv_lot_pilot_v1 ORDER BY id");}
function events(db){return db.query("SELECT event_type,event_id,payload_json,allocations_json FROM inv_lot_event_pilot_v1 ORDER BY event_id");}
function finance(db){
 return {grn:db.query("SELECT * FROM pilot_grn_finance ORDER BY event_id"),
   sales:db.query("SELECT * FROM pilot_sale_finance ORDER BY event_id")};
}
function seed(db){
  pilot.receivePilotLotSqlite(db,receipt({eventId:"grn-1",lotId:"old",batchCode:"EARLY",expiresOn:"2026-11-01",quantityMilli:2000,
    commitReceiptEvent:tx=>tx.exec("INSERT INTO pilot_grn_finance VALUES(?,?)",["grn-1",2000])}));
  pilot.receivePilotLotSqlite(db,receipt({eventId:"grn-2",lotId:"later",batchCode:"LATE",expiresOn:"2027-01-01",quantityMilli:5000,
    commitReceiptEvent:tx=>tx.exec("INSERT INTO pilot_grn_finance VALUES(?,?)",["grn-2",5000])}));
}
test("SQLite GRN receipts feed real versioned rows; FEFO checkout debits earliest first",()=>{
  const db=dbFactory();seed(db);
  const out=pilot.sellPilotLotFefoSqlite(db,sale());
  assert.equal(out.disposition,"applied");
  assert.deepEqual(out.allocations.map(x=>[x.lotId,x.quantityMilli]),[["old",2000],["later",1500]]);
  assert.deepEqual(lots(db).map(x=>[x.id,x.on_hand_milli,x.version]),[["later",3500,2],["old",0,2]]);
  assert.equal(finance(db).sales.length,1);
  assert.deepEqual(events(db).map(x=>x.event_type),["receipt","receipt","sale"]);
});
test("idempotency prevents double receipt or double checkout, including financial callbacks",()=>{
  const db=dbFactory();seed(db);
  const before=JSON.stringify({lots:lots(db),events:events(db),finance:finance(db)});
  const replay=pilot.receivePilotLotSqlite(db,receipt({eventId:"grn-1",lotId:"old",batchCode:"EARLY",expiresOn:"2026-11-01",quantityMilli:2000,
    commitReceiptEvent:()=>{throw new Error("must never execute on replay")}}));
  assert.equal(replay.disposition,"already_applied");
  assert.equal(JSON.stringify({lots:lots(db),events:events(db),finance:finance(db)}),before);
  pilot.sellPilotLotFefoSqlite(db,sale());
  const afterSale=JSON.stringify({lots:lots(db),events:events(db),finance:finance(db)});
  assert.equal(pilot.sellPilotLotFefoSqlite(db,sale({commitFinancialEvent:()=>{throw new Error("duplicate charge")}})).disposition,"already_applied");
  assert.equal(JSON.stringify({lots:lots(db),events:events(db),finance:finance(db)}),afterSale);
  assert.throws(()=>pilot.sellPilotLotFefoSqlite(db,sale({quantityMilli:1000})),/Idempotency/);
  assert.throws(()=>pilot.receivePilotLotSqlite(db,receipt({eventId:"sale-1"})),/Idempotency/);
  assert.equal(JSON.stringify({lots:lots(db),events:events(db),finance:finance(db)}),afterSale);
});
test("SQL transaction rolls back GRN and sale when financial writer fails or is no-op",()=>{
  const db=dbFactory();
  assert.throws(()=>pilot.receivePilotLotSqlite(db,receipt({commitReceiptEvent:()=>{}})),/no SQL change/);
  assert.deepEqual(lots(db),[]);assert.deepEqual(events(db),[]);
  assert.throws(()=>pilot.receivePilotLotSqlite(db,receipt({commitReceiptEvent:tx=>{
    tx.exec("INSERT INTO pilot_grn_finance VALUES(?,?)",["grn-1",5000]);
    throw new Error("GRN financial validation failed");
  }})),/financial validation failed/);
  assert.deepEqual(lots(db),[]);assert.deepEqual(finance(db).grn,[]);
  seed(db);
  const before=JSON.stringify({lots:lots(db),events:events(db),finance:finance(db)});
  assert.throws(()=>pilot.sellPilotLotFefoSqlite(db,sale({commitFinancialEvent:()=>{}})),/no SQL change/);
  assert.throws(()=>pilot.sellPilotLotFefoSqlite(db,sale({commitFinancialEvent:tx=>{
    tx.exec("INSERT INTO pilot_sale_finance VALUES(?,?)",["sale-1",3500]);
    throw new Error("Sale financial validation failed");
  }})),/financial validation failed/);
  assert.equal(JSON.stringify({lots:lots(db),events:events(db),finance:finance(db)}),before);
});
test("blocked, expired, shortage and corrupted quantity conditions fail closed",()=>{
  const db=dbFactory();
  pilot.receivePilotLotSqlite(db,receipt({eventId:"old-expired",lotId:"expired",batchCode:"X",expiresOn:"2026-10-01",status:"blocked",
    commitReceiptEvent:tx=>tx.exec("INSERT INTO pilot_grn_finance VALUES(?,?)",["old-expired",5000])}));
  pilot.receivePilotLotSqlite(db,receipt({eventId:"blocked",lotId:"blocked",batchCode:"Y",status:"blocked",
    commitReceiptEvent:tx=>tx.exec("INSERT INTO pilot_grn_finance VALUES(?,?)",["blocked",5000])}));
  const before=JSON.stringify(lots(db));
  assert.throws(()=>pilot.sellPilotLotFefoSqlite(db,sale({quantityMilli:100})),/Insufficient/);
  assert.equal(JSON.stringify(lots(db)),before);
  assert.throws(()=>pilot.receivePilotLotSqlite(db,receipt({eventId:"bad-expiry",lotId:"active-expired",expiresOn:"2026-10-01"})),/expired active/);
  assert.throws(()=>pilot.receivePilotLotSqlite(db,receipt({eventId:"bad-date",receiptDate:"2026-02-30"})),/Invalid GRN/);
  assert.throws(()=>pilot.sellPilotLotFefoSqlite(db,sale({businessDate:"2026-02-30"})),/Invalid sale/);
  assert.throws(()=>pilot.sellPilotLotFefoSqlite(db,sale({quantityMilli:0})),/Invalid sale/);
});
test("GRN updates the same batch by CAS, disallows batch identity drift",()=>{
  const db=dbFactory();
  pilot.receivePilotLotSqlite(db,receipt());
  const out=pilot.receivePilotLotSqlite(db,receipt({eventId:"grn-2",quantityMilli:3000,
    commitReceiptEvent:tx=>tx.exec("INSERT INTO pilot_grn_finance VALUES(?,?)",["grn-2",3000])}));
  assert.equal(out.disposition,"applied");
  assert.deepEqual(lots(db).map(x=>[x.on_hand_milli,x.version]),[[8000,2]]);
  assert.throws(()=>pilot.receivePilotLotSqlite(db,receipt({eventId:"grn-3",lotId:"new-id",quantityMilli:1000})),/Batch code already/);
  assert.throws(()=>pilot.receivePilotLotSqlite(db,receipt({eventId:"grn-4",batchCode:"OTHER",quantityMilli:1000})),/immutable/);
  assert.equal(finance(db).grn.length,2);
});
test("concurrent version/stock compare-and-swap conflict undoes partial sale and ledger",()=>{
  const db=dbFactory();seed(db);const original=JSON.stringify({lots:lots(db),events:events(db),finance:finance(db)});
  let updates=0;
  const sabotage={...db,exec(sql,params){
    if(sql.includes("UPDATE inv_lot_pilot_v1") && ++updates===2)
      return db.exec(sql+" AND 1=0",params);
    return db.exec(sql,params);
  }};
  assert.throws(()=>pilot.sellPilotLotFefoSqlite(sabotage,sale()),/CAS conflict/);
  assert.equal(JSON.stringify({lots:lots(db),events:events(db),finance:finance(db)}),original);
});
test("trusted permission scope and event identity reject unauthorized GRN/sales",()=>{
  const db=dbFactory();
  assert.throws(()=>pilot.receivePilotLotSqlite(db,receipt({orgId:"org2"})),/access denied/);
  assert.throws(()=>pilot.receivePilotLotSqlite(db,receipt({authorizeWarehouse:undefined})),/authorization is required/);
  assert.throws(()=>pilot.sellPilotLotFefoSqlite(db,sale({warehouseId:"other"})),/access denied/);
  assert.throws(()=>pilot.sellPilotLotFefoSqlite(db,sale({commitFinancialEvent:undefined})),/financial writer/);
  assert.deepEqual(lots(db),[]);assert.deepEqual(events(db),[]);
});
test("no pilot schema means existing production DB is left untouched",()=>{
 const db=dbFactory(false);
 assert.throws(()=>pilot.receivePilotLotSqlite(db,receipt()),/no such table/);
 assert.deepEqual(db.query("SELECT * FROM pilot_grn_finance"),[]);
});
test("barrel export and docs do not claim production integration",()=>{
 const idx=fs.readFileSync(new URL("../index.ts",import.meta.url),"utf8");
 const doc=fs.readFileSync(new URL("../../../../docs/INV_005_SQLITE_GRN_SALE_PILOT.md",import.meta.url),"utf8");
 assert.match(idx,/export \* from "\.\/lot-stock-sqlite-pilot";/);
 assert.match(doc,/NOT production POS/);
});
