import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const dbRequire=createRequire(new URL("../../../database/package.json",import.meta.url));
const ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(
 ts.transpileModule(fs.readFileSync(file,"utf8"),{
   fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
 }).outputText,file,
);
const lot=require("../lot-stock-sqlite-pilot.ts");
const returns=require("../lot-return-sqlite-pilot.ts");
const SQL=await dbRequire("sql.js/dist/sql-asm.js")();
function connection(init=true){
  const raw=new SQL.Database();
  const db={
    exec(sql,params=[]){raw.run(sql,params);},
    query(sql,params=[]){
      const stmt=raw.prepare(sql);
      try{stmt.bind(params);const rows=[];while(stmt.step())rows.push(stmt.getAsObject());return rows;}
      finally{stmt.free();}
    },
    transaction(fn){raw.run("BEGIN IMMEDIATE");
      try{const r=fn();raw.run("COMMIT");return r;}
      catch(error){raw.run("ROLLBACK");throw error;}
    },
  };
  if(init)lot.initializeLotStockPilotSqlite(db);
  db.exec("CREATE TABLE test_receipt_finance (event TEXT PRIMARY KEY)");
  db.exec("CREATE TABLE test_sale_finance (event TEXT PRIMARY KEY)");
  db.exec("CREATE TABLE test_refund_finance (event TEXT PRIMARY KEY, quantity INTEGER NOT NULL)");
  return db;
}
const authorizeWarehouse=(org,wh)=>{if(org!=="org1"||wh!=="wh1")throw new Error("unauthorized warehouse");};
function receipt(overrides={}){
  return {
    orgId:"org1",warehouseId:"wh1",eventId:"grn1",lotId:"old",
    productId:"sku1",batchCode:"EARLY",receiptDate:"2026-10-22",
    expiresOn:"2026-11-01",quantityMilli:2000,status:"active",
    authorizeWarehouse,commitReceiptEvent:db=>db.exec("INSERT INTO test_receipt_finance VALUES(?)",["grn1"]),
    ...overrides,
  };
}
function sale(overrides={}){
  return {
    orgId:"org1",warehouseId:"wh1",eventId:"sale1",productId:"sku1",
    businessDate:"2026-10-23",quantityMilli:3500,authorizeWarehouse,
    commitFinancialEvent:db=>db.exec("INSERT INTO test_sale_finance VALUES(?)",["sale1"]),
    ...overrides,
  };
}
function ret(overrides={}){
  return {
    orgId:"org1",warehouseId:"wh1",returnEventId:"return1",saleEventId:"sale1",
    productId:"sku1",returnDate:"2026-10-24",quantityMilli:1000,authorizeWarehouse,
    commitFinancialReturn:db=>db.exec("INSERT INTO test_refund_finance VALUES(?,?)",["return1",1000]),
    ...overrides,
  };
}
function seed(db){
  lot.receivePilotLotSqlite(db,receipt());
  lot.receivePilotLotSqlite(db,receipt({
    eventId:"grn2",lotId:"later",batchCode:"LATE",expiresOn:"2027-02-01",
    quantityMilli:5000,commitReceiptEvent:tx=>tx.exec("INSERT INTO test_receipt_finance VALUES(?)",["grn2"]),
  }));
  lot.sellPilotLotFefoSqlite(db,sale());
}
const rows=(db)=>({
  lots:db.query("SELECT id,on_hand_milli,version FROM inv_lot_pilot_v1 ORDER BY id"),
  events:db.query("SELECT event_id,event_type,allocations_json FROM inv_lot_event_pilot_v1 ORDER BY event_id"),
  custody:db.query("SELECT return_event_id,sale_event_id,quantity_milli FROM inv_lot_return_pilot_v1 ORDER BY return_event_id"),
  quarantine:db.query("SELECT return_event_id,lot_id,quantity_milli,status FROM inv_lot_quarantine_pilot_v1 ORDER BY return_event_id,lot_id"),
  refund:db.query("SELECT * FROM test_refund_finance ORDER BY event"),
});
test("partial return uses exact original sale allocations and never makes returned stock saleable",()=>{
  const db=connection();seed(db);
  const beforeLots=JSON.stringify(rows(db).lots);
  const one=returns.acceptPilotLotReturnSqlite(db,ret());
  assert.equal(one.disposition,"applied");
  assert.equal(one.quarantineOnly,true);
  assert.deepEqual(one.allocations.map(a=>[a.lotId,a.quantityMilli]),[["old",1000]]);
  assert.equal(JSON.stringify(rows(db).lots),beforeLots);
  const two=returns.acceptPilotLotReturnSqlite(db,ret({
    returnEventId:"return2",quantityMilli:2000,
    commitFinancialReturn:tx=>tx.exec("INSERT INTO test_refund_finance VALUES(?,?)",["return2",2000]),
  }));
  assert.deepEqual(two.allocations.map(a=>[a.lotId,a.quantityMilli]),[["old",1000],["later",1000]]);
  const three=returns.acceptPilotLotReturnSqlite(db,ret({
    returnEventId:"return3",quantityMilli:500,
    commitFinancialReturn:tx=>tx.exec("INSERT INTO test_refund_finance VALUES(?,?)",["return3",500]),
  }));
  assert.deepEqual(three.allocations.map(a=>[a.lotId,a.quantityMilli]),[["later",500]]);
  assert.equal(rows(db).quarantine.length,4);
  assert.equal(rows(db).refund.length,3);
  assert.equal(JSON.stringify(rows(db).lots),beforeLots);
  assert.throws(()=>returns.acceptPilotLotReturnSqlite(db,ret({
    returnEventId:"return4",quantityMilli:1,
  })),/exceeds quantity sold/);
});
test("return idempotency prevents duplicate refund; changing return payload with same ID rejects",()=>{
  const db=connection();seed(db);
  returns.acceptPilotLotReturnSqlite(db,ret());
  const before=JSON.stringify(rows(db));
  const repeat=returns.acceptPilotLotReturnSqlite(db,ret({
    commitFinancialReturn:()=>{throw new Error("must not refund twice");},
  }));
  assert.equal(repeat.disposition,"already_applied");
  assert.equal(JSON.stringify(rows(db)),before);
  assert.throws(()=>returns.acceptPilotLotReturnSqlite(db,ret({
    quantityMilli:200,commitFinancialReturn:()=>{},
  })),/idempotency key/);
  assert.throws(()=>lot.sellPilotLotFefoSqlite(db,sale({
    eventId:"return1",quantityMilli:1000,commitFinancialEvent:()=>{},
  })),/Idempotency/);
  assert.equal(JSON.stringify(rows(db)),before);
});
test("failed, no-op, and late SQL custody writers roll back financial refund atomically",()=>{
  const db=connection();seed(db);
  const before=JSON.stringify(rows(db));
  assert.throws(()=>returns.acceptPilotLotReturnSqlite(db,ret({
    commitFinancialReturn:()=>{},
  })),/no SQL change/);
  assert.equal(JSON.stringify(rows(db)),before);
  assert.throws(()=>returns.acceptPilotLotReturnSqlite(db,ret({
    commitFinancialReturn:tx=>{
      tx.exec("INSERT INTO test_refund_finance VALUES(?,?)",["return1",1000]);
      throw new Error("refund posting failed");
    },
  })),/refund posting failed/);
  assert.equal(JSON.stringify(rows(db)),before);
  const sabotage={...db,exec(sql,params){
    if(sql.includes("INSERT INTO inv_lot_quarantine_pilot_v1")){
      return db.exec(sql.replace("VALUES(?,?,?,?,?,?,?,'quarantined')","VALUES(?,?,?,?,?,?,?,'invalid')"),params);
    }
    return db.exec(sql,params);
  }};
  assert.throws(()=>returns.acceptPilotLotReturnSqlite(sabotage,ret()),/CHECK constraint/);
  assert.equal(JSON.stringify(rows(db)),before);
});
test("foreign org/warehouse/sale/product, invalid day and mismatched return refuse all writes",()=>{
  const db=connection();seed(db);
  const before=JSON.stringify(rows(db));
  for(const [changes,re] of [
    [{orgId:"org2"},/unauthorized/],
    [{warehouseId:"wh2"},/unauthorized/],
    [{saleEventId:"grn1"},/Authoritative source sale/],
    [{saleEventId:"missing"},/Authoritative source sale/],
    [{productId:"sku2"},/does not match posted sale/],
    [{returnDate:"2026-10-22"},/precedes sale/],
    [{returnDate:"2026-02-30"},/Invalid batch sale return/],
    [{quantityMilli:-1},/Invalid batch sale return/],
    [{quantityMilli:3501},/exceeds quantity sold/],
    [{returnEventId:"sale1"},/Invalid batch sale return/],
    [{returnEventId:"grn1"},/idempotency key/],
    [{authorizeWarehouse:undefined},/authorization is required/],
    [{commitFinancialReturn:undefined},/financial refund writer/],
  ]){
    assert.throws(()=>returns.acceptPilotLotReturnSqlite(db,ret(changes)),re);
  }
  assert.equal(JSON.stringify(rows(db)),before);
});
test("returned lot remains quarantined even after source lot expiry",()=>{
 const db=connection();seed(db);
 const one=returns.acceptPilotLotReturnSqlite(db,ret({returnDate:"2027-03-01"}));
 assert.equal(one.quarantineOnly,true);
 assert.equal(db.query("SELECT status FROM inv_lot_quarantine_pilot_v1")[0].status,"quarantined");
 assert.equal(db.query("SELECT on_hand_milli FROM inv_lot_pilot_v1 WHERE id='old'")[0].on_hand_milli,0);
});
test("pilot tables are opt-in and not initialized on existing production SQLite",()=>{
  const db=connection(false);
  assert.throws(()=>returns.acceptPilotLotReturnSqlite(db,ret()),/no such table/);
  assert.equal(db.query("SELECT COUNT(*) AS n FROM test_refund_finance")[0].n,0);
});
test("versioned core source and integration documentation make boundaries explicit",()=>{
 const index=fs.readFileSync(new URL("../index.ts",import.meta.url),"utf8");
 const docs=fs.readFileSync(new URL("../../../../docs/INV_005_SQLITE_RETURN_QUARANTINE.md",import.meta.url),"utf8");
 assert.match(index,/export \* from "\.\/lot-return-sqlite-pilot";/);
 assert.match(docs,/NOT production POS/);
 assert.match(docs,/quarantined/);
});
