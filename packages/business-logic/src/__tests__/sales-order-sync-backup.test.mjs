import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";import {createRequire} from "node:module";
const require=createRequire(import.meta.url), dbRequire=createRequire(new URL("../../../database/package.json",import.meta.url));
const ts=require("typescript");
require.extensions[".ts"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),{
 fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const SQL=await dbRequire("sql.js/dist/sql-asm.js")();
const api=require("../sales-order-sqlite.ts");
const sync=require("../sales-order-sync-receipt-sqlite.ts");
const backup=require("../sales-order-backup-sqlite.ts");
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const auth={organizationId:uuid(1),companyId:uuid(2),branchId:uuid(3),warehouseId:uuid(4),canManageSalesOrders:true};
function db(){
 const raw=new SQL.Database();
 const result={exec(s,p=[]){raw.run(s,p);},
 query(s,p=[]){const st=raw.prepare(s);try{st.bind(p);let rows=[];while(st.step())rows.push(st.getAsObject());return rows;}finally{st.free()}},
 transaction(fn){raw.run("BEGIN IMMEDIATE");try{const v=fn();raw.run("COMMIT");return v;}catch(e){raw.run("ROLLBACK");throw e;}}};
 api.initializeSalesOrderSqlite(result,true);return result;
}
const req=()=>({...auth,id:uuid(5),operationId:uuid(6),orderNumber:"SO-BACKUP-ACK-001",
 customerId:uuid(7),currency:"INR",createdAt:"2026-10-21T06:00:00.000Z",
 lines:[{id:uuid(8),productId:uuid(9),description:"Paper",
 quantityMilli:1000,unitPriceMinor:100,discountMinor:0,taxMinor:0}]});
const verified=()=>true;
function seeded(){
 const conn=db();api.createSalesOrderSqlite(conn,req(),auth,true,verified);
 api.transitionSalesOrderSqlite(conn,uuid(5),{operationId:uuid(10),action:"confirm",
 expectedVersion:1,occurredAt:"2026-10-21T06:01:00.000Z"},auth,true,undefined,verified);
 const first=api.listSalesOrderEventHistorySqlite(conn,auth,true)[0];
 const receipt={...auth,serverReceiptId:uuid(40),orderId:first.orderId,
 operationId:first.operationId,orderVersion:first.orderVersion,eventType:first.eventType,
 receivedAt:"2026-10-21T06:03:00.000Z",event:first};
 sync.acknowledgeSalesOrderCloudEventSqlite(conn,receipt,auth,true,verified);
 return conn;
}
test("v2 backup includes ACKed event and restores sync state only after trusted re-verification",()=>{
 const source=seeded(),target=db();
 const saved=backup.exportSalesOrderPilotBackupSqlite(source,auth,true);
 assert.equal(saved.schemaVersion,2);
 assert.equal(saved.pendingEvents.length,2);
 assert.equal(saved.cloudReceipts.length,1);
 assert.equal(api.listPendingSalesOrderEventsSqlite(source,auth,true).length,1);
 assert.throws(()=>backup.restoreSalesOrderPilotBackupSqlite(target,saved,auth,true),
 /Trusted cloud receipt verification required/);
 assert.deepEqual(backup.restoreSalesOrderPilotBackupSqlite(target,saved,auth,true,verified),
  {restoredOrders:1,restoredPendingEvents:2});
 assert.deepEqual(backup.exportSalesOrderPilotBackupSqlite(target,auth,true),saved);
 assert.equal(api.listPendingSalesOrderEventsSqlite(target,auth,true).length,1);
 assert.equal(sync.listSalesOrderCloudReceiptsSqlite(target,auth,true).length,1);
});
test("mutated and forged acknowledgements cannot make pending events disappear after restore",()=>{
 const source=seeded(),saved=backup.exportSalesOrderPilotBackupSqlite(source,auth,true);
 for(const altered of [
  {...saved,cloudReceipts:[{...saved.cloudReceipts[0],serverReceiptId:uuid(41),
    event:{...saved.cloudReceipts[0].event,eventType:"amended"}}]},
  {...saved,cloudReceipts:[...saved.cloudReceipts,saved.cloudReceipts[0]]},
  {...saved,cloudReceipts:[{...saved.cloudReceipts[0],branchId:uuid(55)}]},
 ]) {
  const target=db();
  assert.throws(()=>backup.restoreSalesOrderPilotBackupSqlite(target,altered,auth,true,verified));
  assert.equal(api.listSalesOrderEventHistorySqlite(target,auth,true).length,0);
 }
 const target=db();
 assert.throws(()=>backup.restoreSalesOrderPilotBackupSqlite(target,saved,auth,true,()=>false),
 /verification denied/);
 assert.equal(api.listPendingSalesOrderEventsSqlite(target,auth,true).length,0);
 assert.equal(target.query("SELECT count(*) AS n FROM retail_sales_order_sync_receipts_v1")[0].n,0);
});
test("legacy v1 backup remains restorable as entirely pending history",()=>{
 const original=backup.exportSalesOrderPilotBackupSqlite(seeded(),auth,true);
 const v1={...original,schemaVersion:1};
 delete v1.cloudReceipts;
 const target=db();
 backup.restoreSalesOrderPilotBackupSqlite(target,v1,auth,true);
 assert.equal(api.listPendingSalesOrderEventsSqlite(target,auth,true).length,2);
 assert.equal(sync.listSalesOrderCloudReceiptsSqlite(target,auth,true).length,0);
});
