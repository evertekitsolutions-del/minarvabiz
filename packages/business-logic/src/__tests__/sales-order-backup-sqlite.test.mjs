import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const dbr = createRequire(new URL("../../../database/package.json",import.meta.url));
const ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(
  fs.readFileSync(file,"utf8"),{fileName:file,compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const pilot=require("../sales-order-sqlite.ts");
const backup=require("../sales-order-backup-sqlite.ts");
const SQL=await dbr("sql.js/dist/sql-asm.js")();
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const auth={organizationId:uuid(1),companyId:uuid(2),branchId:uuid(3),
  warehouseId:uuid(4),canManageSalesOrders:true};
const request=()=>({...auth,id:uuid(5),operationId:uuid(6),
  orderNumber:"SO-100",customerId:uuid(7),currency:"INR",
  createdAt:"2026-10-21T07:00:00.000Z",
  lines:[{id:uuid(8),productId:uuid(9),description:"Notebook",
    quantityMilli:1000,unitPriceMinor:500,discountMinor:0,taxMinor:0}]});
function db(){
  const raw=new SQL.Database();
  const out={
    exec(s,p=[]){raw.run(s,p);},
    query(s,p=[]){const st=raw.prepare(s);try{st.bind(p);const rows=[];while(st.step())rows.push(st.getAsObject());return rows;}finally{st.free()}},
    transaction(fn){raw.run("BEGIN IMMEDIATE");try{const v=fn();raw.run("COMMIT");return v;}catch(e){raw.run("ROLLBACK");throw e;}},
  };
  pilot.initializeSalesOrderSqlite(out,true);
  return out;
}
const valid=()=>true;
function seeded(){
  const out=db();
  pilot.createSalesOrderSqlite(out,request(),auth,true,valid);
  pilot.amendSalesOrderSqlite(out,uuid(5),{operationId:uuid(10),
    expectedVersion:1,occurredAt:"2026-10-21T07:01:00.000Z",
    lines:[{...request().lines[0],quantityMilli:2000}]},auth,true,valid);
  pilot.transitionSalesOrderSqlite(out,uuid(5),{operationId:uuid(11),
    expectedVersion:2,occurredAt:"2026-10-21T07:02:00.000Z",
    action:"confirm"},auth,true,undefined,valid);
  return out;
}
test("fully scoped offline backup restores 3 pending revisions and order atomically",()=>{
  const source=seeded(),dest=db();
  const saved=backup.exportSalesOrderPilotBackupSqlite(source,auth,true);
  assert.equal(saved.orders.length,1);
  assert.deepEqual(saved.pendingEvents.map(x=>x.eventType),
    ["created","amended","confirmed"]);
  const before=JSON.stringify(saved);
  assert.deepEqual(backup.restoreSalesOrderPilotBackupSqlite(dest,saved,auth,true),
    {restoredOrders:1,restoredPendingEvents:3});
  assert.equal(JSON.stringify(saved),before);
  const restored=backup.exportSalesOrderPilotBackupSqlite(dest,auth,true);
  assert.deepEqual(restored,saved);
  assert.equal(restored.pendingEvents.every(x=>x.orderVersion>0),true);
  assert.throws(()=>backup.restoreSalesOrderPilotBackupSqlite(dest,saved,auth,true),
    /empty scoped destination/);
});
test("wrong tenant and missing permission cannot export or restore",()=>{
  const source=seeded(),dest=db(),saved=backup.exportSalesOrderPilotBackupSqlite(source,auth,true);
  const bad={...auth,branchId:uuid(42)};
  assert.throws(()=>backup.exportSalesOrderPilotBackupSqlite(source,auth),/disabled/);
  assert.throws(()=>backup.restoreSalesOrderPilotBackupSqlite(dest,saved,auth),/disabled/);
  assert.throws(()=>backup.exportSalesOrderPilotBackupSqlite(source,{...auth,canManageSalesOrders:false},true),/authority denied/);
  assert.throws(()=>backup.restoreSalesOrderPilotBackupSqlite(dest,saved,bad,true),/Cross-scope/);
  assert.equal(backup.exportSalesOrderPilotBackupSqlite(dest,auth,true).orders.length,0);
});
test("missing, swapped and corrupted event revisions reject without any restore",()=>{
  const saved=backup.exportSalesOrderPilotBackupSqlite(seeded(),auth,true);
  const mutations=[
    {...saved,pendingEvents:saved.pendingEvents.slice(1)},
    {...saved,pendingEvents:[...saved.pendingEvents].reverse()},
    {...saved,pendingEvents:[...saved.pendingEvents,saved.pendingEvents[0]]},
    {...saved,pendingEvents:saved.pendingEvents.map((e,i)=>i===2
      ? {...e,order:{...e.order,totalMinor:e.order.totalMinor+1}}:e)},
    {...saved,pendingEvents:saved.pendingEvents.map((e,i)=>i===2
      ? {...e,organizationId:uuid(23)}:e)},
    {...saved,orders:saved.orders.map(x=>({...x,totalMinor:999}))},
    {...saved,orders:[]},
    {...saved,schemaVersion:3},
  ];
  for(const corrupted of mutations){
    const dest=db();
    assert.throws(()=>backup.restoreSalesOrderPilotBackupSqlite(dest,corrupted,auth,true));
    assert.equal(dest.query("SELECT count(*) AS n FROM retail_sales_order_intents_v1")[0].n,0);
    assert.equal(dest.query("SELECT count(*) AS n FROM retail_sales_order_pending_events_v1")[0].n,0);
  }
});
test("mid-restore SQL collision rolls back all inserted orders/events",()=>{
  const saved=backup.exportSalesOrderPilotBackupSqlite(seeded(),auth,true);
  const dest=db();
  dest.exec("CREATE TRIGGER reject_pending_before_insert BEFORE INSERT ON retail_sales_order_pending_events_v1 BEGIN SELECT RAISE(ABORT,'injected write failure'); END");
  assert.throws(()=>backup.restoreSalesOrderPilotBackupSqlite(dest,saved,auth,true),/injected write failure/);
  assert.equal(dest.query("SELECT count(*) AS n FROM retail_sales_order_intents_v1")[0].n,0);
  assert.equal(dest.query("SELECT count(*) AS n FROM retail_sales_order_pending_events_v1")[0].n,0);
});
test("empty scoped snapshot restores as no-op and stays scoped",()=>{
  const source=db(),dest=db();
  const saved=backup.exportSalesOrderPilotBackupSqlite(source,auth,true);
  assert.deepEqual(backup.restoreSalesOrderPilotBackupSqlite(dest,saved,auth,true),
    {restoredOrders:0,restoredPendingEvents:0});
  assert.deepEqual(backup.exportSalesOrderPilotBackupSqlite(dest,auth,true),saved);
});

test("export reads orders and pending history in one SQLite transaction",()=>{
  const source=seeded();
  const original=source.transaction.bind(source);
  let transactions=0;
  source.transaction=(fn)=>{transactions++;return original(fn)};
  const saved=backup.exportSalesOrderPilotBackupSqlite(source,auth,true);
  assert.equal(transactions,1);
  assert.equal(saved.orders[0].version,saved.pendingEvents.at(-1).orderVersion);
});
test("export rejects corrupted local pending history, rather than producing a bad backup",()=>{
  const source=seeded();
  const original=backup.exportSalesOrderPilotBackupSqlite(source,auth,true);
  const broken=structuredClone(original.pendingEvents[1]);
  broken.order.totalMinor++;
  source.exec("UPDATE retail_sales_order_pending_events_v1 SET payload_json=? WHERE operation_id=?",
    [JSON.stringify(broken),broken.operationId]);
  assert.throws(()=>backup.exportSalesOrderPilotBackupSqlite(source,auth,true),/Corrupt retail sales-order record/);
  assert.equal(source.query("SELECT count(*) AS count FROM retail_sales_order_pending_events_v1 WHERE status='pending'")[0].count,3);
});
