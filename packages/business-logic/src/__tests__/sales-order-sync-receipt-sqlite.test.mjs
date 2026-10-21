import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs"; import {createRequire} from "node:module";
const require=createRequire(import.meta.url), dbRequire=createRequire(new URL("../../../database/package.json",import.meta.url));
const ts=require("typescript");
require.extensions[".ts"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),
 {fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const SQL=await dbRequire("sql.js/dist/sql-asm.js")();
const api=require("../sales-order-sqlite.ts"),sync=require("../sales-order-sync-receipt-sqlite.ts");
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const auth={organizationId:uuid(1),companyId:uuid(2),branchId:uuid(3),warehouseId:uuid(4),canManageSalesOrders:true};
function database(){
 const raw=new SQL.Database();
 const out={exec(s,p=[]){raw.run(s,p);},query(s,p=[]){const st=raw.prepare(s);try{st.bind(p);let res=[];while(st.step())res.push(st.getAsObject());return res;}finally{st.free()}},
  transaction(fn){raw.run("BEGIN IMMEDIATE");try{let x=fn();raw.run("COMMIT");return x;}catch(e){raw.run("ROLLBACK");throw e;}}};
 api.initializeSalesOrderSqlite(out,true);return out;
}
const request=()=>({...auth,id:uuid(5),operationId:uuid(6),orderNumber:"SO-SYNC-001",
 customerId:uuid(7),currency:"INR",createdAt:"2026-10-21T06:00:00.000Z",
 lines:[{id:uuid(8),productId:uuid(9),description:"Paper",quantityMilli:1000,
 unitPriceMinor:100,discountMinor:0,taxMinor:0}]});
function seeded(){
 const db=database();
 api.createSalesOrderSqlite(db,request(),auth,true,()=>true);
 api.transitionSalesOrderSqlite(db,uuid(5),{operationId:uuid(10),
 action:"confirm",expectedVersion:1,occurredAt:"2026-10-21T06:01:00.000Z"},
 auth,true,undefined,()=>true);
 return db;
}
function receipt(event,id=20){
 return {...auth,serverReceiptId:uuid(id),orderId:event.orderId,
 operationId:event.operationId,orderVersion:event.orderVersion,
 eventType:event.eventType,receivedAt:"2026-10-21T06:03:00.000Z",event};
}
const verified=()=>true;
test("authoritative ack is ordered, idempotent, and leaves immutable event history",()=>{
 const db=seeded();
 const all=api.listSalesOrderEventHistorySqlite(db,auth,true);
 assert.equal(all.length,2);
 assert.equal(api.listPendingSalesOrderEventsSqlite(db,auth,true).length,2);
 assert.throws(()=>sync.acknowledgeSalesOrderCloudEventSqlite(db,receipt(all[0]),auth,true),/Trusted cloud/);
 assert.throws(()=>sync.acknowledgeSalesOrderCloudEventSqlite(db,receipt(all[1],21),auth,true,verified),
  /cannot skip pending/);
 const first=sync.acknowledgeSalesOrderCloudEventSqlite(db,receipt(all[0]),auth,true,verified);
 assert.equal(first.disposition,"new");
 assert.equal(sync.acknowledgeSalesOrderCloudEventSqlite(db,receipt(all[0]),auth,true,verified).disposition,"replay");
 assert.deepEqual(api.listPendingSalesOrderEventsSqlite(db,auth,true).map(x=>x.orderVersion),[2]);
 assert.equal(sync.acknowledgeSalesOrderCloudEventSqlite(db,receipt(all[1],21),auth,true,verified).disposition,"new");
 assert.equal(api.listPendingSalesOrderEventsSqlite(db,auth,true).length,0);
 assert.equal(api.listSalesOrderEventHistorySqlite(db,auth,true).length,2);
 assert.equal(sync.listSalesOrderCloudReceiptsSqlite(db,auth,true).length,2);
 assert.equal(api.listSalesOrdersSqlite(db,auth,true)[0].status,"confirmed");
});
test("fake or mismatched receipts never drain pending or commit",()=>{
 const db=seeded(),first=api.listSalesOrderEventHistorySqlite(db,auth,true)[0];
 const base=receipt(first);
 for(const bad of [
  {...base,organizationId:uuid(91)}, {...base,orderVersion:2},
  {...base,event:{...base.event,order:{...base.event.order,totalMinor:999}}},
  {...base,serverReceiptId:"bad"}, {...base,eventType:"confirmed"},
  {...base,receivedAt:"invalid"},
 ]) assert.throws(()=>sync.acknowledgeSalesOrderCloudEventSqlite(db,bad,auth,true,verified));
 assert.throws(()=>sync.acknowledgeSalesOrderCloudEventSqlite(db,base,auth,true,()=>false),/verification denied/);
 assert.equal(sync.listSalesOrderCloudReceiptsSqlite(db,auth,true).length,0);
 assert.equal(api.listPendingSalesOrderEventsSqlite(db,auth,true).length,2);
});
test("replay conflict, cross-branch and untrusted status fail closed",()=>{
 const db=seeded(),base=receipt(api.listSalesOrderEventHistorySqlite(db,auth,true)[0]);
 sync.acknowledgeSalesOrderCloudEventSqlite(db,base,auth,true,verified);
 assert.throws(()=>sync.acknowledgeSalesOrderCloudEventSqlite(db,{...base,serverReceiptId:uuid(80)},auth,true,verified),/replay conflict/);
 assert.throws(()=>sync.acknowledgeSalesOrderCloudEventSqlite(db,base,{...auth,branchId:uuid(60)},true,verified),/Cross-scope|missing/);
 assert.throws(()=>sync.acknowledgeSalesOrderCloudEventSqlite(db,base,auth),/disabled/);
 assert.throws(()=>sync.acknowledgeSalesOrderCloudEventSqlite(db,base,{...auth,canManageSalesOrders:false},true,verified),/permission denied/);
 assert.equal(sync.listSalesOrderCloudReceiptsSqlite(db,auth,true).length,1);
});
test("SQL receipt insert failure rolls back and retains local pending revision",()=>{
 const db=seeded(),base=receipt(api.listSalesOrderEventHistorySqlite(db,auth,true)[0]);
 db.exec("CREATE TRIGGER block_ack BEFORE INSERT ON retail_sales_order_sync_receipts_v1 BEGIN SELECT RAISE(ABORT,'ack unavailable'); END");
 assert.throws(()=>sync.acknowledgeSalesOrderCloudEventSqlite(db,base,auth,true,verified),/ack unavailable/);
 assert.equal(api.listPendingSalesOrderEventsSqlite(db,auth,true).length,2);
 assert.equal(db.query("SELECT count(*) AS n FROM retail_sales_order_sync_receipts_v1")[0].n,0);
});
