import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const dbRequire=createRequire(new URL("../../../database/package.json",import.meta.url));
const ts=require("typescript");
require.extensions[".ts"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),{
 fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const SQL=await dbRequire("sql.js/dist/sql-asm.js")();
const api=require("../sales-order-sqlite.ts");
const sync=require("../sales-order-sync-receipt-sqlite.ts");
const {prepareSalesOrderUploadBatchSqlite}=require("../sales-order-sync-batch.ts");
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const auth={organizationId:uuid(1),companyId:uuid(2),branchId:uuid(3),warehouseId:uuid(4),canManageSalesOrders:true};
function db(){
 const raw=new SQL.Database();const out={
  exec(s,p=[]){raw.run(s,p);},query(s,p=[]){const st=raw.prepare(s);try{st.bind(p);let rows=[];while(st.step())rows.push(st.getAsObject());return rows;}finally{st.free()}},
  transaction(fn){raw.run("BEGIN IMMEDIATE");try{let v=fn();raw.run("COMMIT");return v;}catch(e){raw.run("ROLLBACK");throw e;}}};
 api.initializeSalesOrderSqlite(out,true);return out;
}
const req=()=>({...auth,id:uuid(5),operationId:uuid(6),orderNumber:"SO-BATCH-1",customerId:uuid(7),
 currency:"INR",createdAt:"2026-10-21T06:00:00.000Z",
 lines:[{id:uuid(8),productId:uuid(9),description:"Paper",quantityMilli:1000,
  unitPriceMinor:100,discountMinor:0,taxMinor:0}]});
function seed(){
 const out=db();
 api.createSalesOrderSqlite(out,req(),auth,true,()=>true);
 api.transitionSalesOrderSqlite(out,uuid(5),{operationId:uuid(10),
  expectedVersion:1,action:"confirm",occurredAt:"2026-10-21T06:01:00.000Z"},
  auth,true,undefined,()=>true);
 return out;
}
function receipt(event){
 return {...auth,serverReceiptId:uuid(event.orderVersion+50),
  operationId:event.operationId,orderId:event.orderId,
  orderVersion:event.orderVersion,eventType:event.eventType,
  receivedAt:"2026-10-21T06:04:00.000Z",event};
}
test("offline upload plan is bounded, side-effect free and chronological",()=>{
 const conn=seed();
 const before=JSON.stringify(api.listSalesOrderEventHistorySqlite(conn,auth,true));
 const first=prepareSalesOrderUploadBatchSqlite(conn,auth,{maxEvents:1},true);
 assert.equal(first.events.length,1);assert.equal(first.events[0].orderVersion,1);
 assert.equal(prepareSalesOrderUploadBatchSqlite(conn,auth,{},true).events.length,2);
 assert.equal(JSON.stringify(api.listSalesOrderEventHistorySqlite(conn,auth,true)),before);
 assert.equal(api.listPendingSalesOrderEventsSqlite(conn,auth,true).length,2);
});
test("verified receipt excludes only that operation from future upload plans",()=>{
 const conn=seed(),events=api.listSalesOrderEventHistorySqlite(conn,auth,true);
 sync.acknowledgeSalesOrderCloudEventSqlite(conn,receipt(events[0]),auth,true,()=>true);
 assert.deepEqual(prepareSalesOrderUploadBatchSqlite(conn,auth,{},true).events.map(e=>e.orderVersion),[2]);
 sync.acknowledgeSalesOrderCloudEventSqlite(conn,receipt(events[1]),auth,true,()=>true);
 assert.equal(prepareSalesOrderUploadBatchSqlite(conn,auth,{},true).events.length,0);
});
test("reject malformed batch bounds and unauthorized cross-branch invocation",()=>{
 const conn=seed();
 for(const limits of [{maxEvents:0},{maxEvents:101},{maxEvents:1.5},
  {maxBytes:100},{maxBytes:1048577},{maxBytes:NaN}]) {
  assert.throws(()=>prepareSalesOrderUploadBatchSqlite(conn,auth,limits,true),/limits/);
 }
 assert.throws(()=>prepareSalesOrderUploadBatchSqlite(conn,auth,{}),/disabled/);
 assert.throws(()=>prepareSalesOrderUploadBatchSqlite(conn,{...auth,canManageSalesOrders:false},{},true),/permission denied/);
 assert.equal(prepareSalesOrderUploadBatchSqlite(conn,{...auth,branchId:uuid(60)},{},true).events.length,0);
});
test("tampered pending event blocks upload and cannot be silently acknowledged",()=>{
 const conn=seed(),events=api.listSalesOrderEventHistorySqlite(conn,auth,true);
 const bad={...events[0],eventType:"invoiced"};
 conn.exec("UPDATE retail_sales_order_pending_events_v1 SET payload_json=? WHERE operation_id=?",
  [JSON.stringify(bad),events[0].operationId]);
 assert.throws(()=>prepareSalesOrderUploadBatchSqlite(conn,auth,{},true),/identity\/revision mismatch/);
 assert.equal(conn.query("SELECT count(*) AS n FROM retail_sales_order_sync_receipts_v1")[0].n,0);
});
test("deleted event revision cannot jump to later cloud event",()=>{
 const conn=seed(),events=api.listSalesOrderEventHistorySqlite(conn,auth,true);
 conn.exec("DELETE FROM retail_sales_order_pending_events_v1 WHERE operation_id=?",[events[0].operationId]);
 assert.throws(()=>prepareSalesOrderUploadBatchSqlite(conn,auth,{},true),/Missing or out-of-order/);
});

test("missing final event cannot falsely report committed order fully synced",()=>{
 const conn=seed(),history=api.listSalesOrderEventHistorySqlite(conn,auth,true);
 conn.exec("DELETE FROM retail_sales_order_pending_events_v1 WHERE operation_id=?",
   [history[1].operationId]);
 assert.throws(()=>prepareSalesOrderUploadBatchSqlite(conn,auth,{},true),
   /event lineage does not match/);
 assert.equal(conn.query("SELECT count(*) AS n FROM retail_sales_order_sync_receipts_v1")[0].n,0);
});
test("missing all local events fails closed even though order record still exists",()=>{
 const conn=seed();
 conn.exec("DELETE FROM retail_sales_order_pending_events_v1");
 assert.throws(()=>prepareSalesOrderUploadBatchSqlite(conn,auth,{},true),
   /event lineage does not match/);
 assert.equal(api.listSalesOrdersSqlite(conn,auth,true)[0].status,"confirmed");
});
test("orphan local event cannot be uploaded after its order record disappears",()=>{
 const conn=seed();
 conn.exec("DELETE FROM retail_sales_order_intents_v1");
 assert.throws(()=>prepareSalesOrderUploadBatchSqlite(conn,auth,{},true),
   /Orphan offline sales-order event/);
 assert.equal(conn.query("SELECT count(*) AS n FROM retail_sales_order_pending_events_v1")[0].n,2);
});
test("valid but divergent last event snapshot cannot overwrite durable local order",()=>{
 const conn=seed(),history=api.listSalesOrderEventHistorySqlite(conn,auth,true);
 const last=history.at(-1);
 const altered={...last,order:{...last.order,note:"Forged prior server text"}};
 conn.exec("UPDATE retail_sales_order_pending_events_v1 SET payload_json=? WHERE operation_id=?",
   [JSON.stringify(altered),last.operationId]);
 assert.throws(()=>prepareSalesOrderUploadBatchSqlite(conn,auth,{},true),
   /event lineage does not match/);
 assert.equal(api.listSalesOrdersSqlite(conn,auth,true)[0].note,null);
});
