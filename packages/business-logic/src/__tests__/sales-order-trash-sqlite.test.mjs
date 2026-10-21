import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";import{createRequire}from"node:module";
const require=createRequire(import.meta.url);
const dbRequire=createRequire(new URL("../../../database/package.json",import.meta.url));
const ts=require("typescript");
require.extensions[".ts"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),{
 fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const SQL=await dbRequire("sql.js/dist/sql-asm.js")();
const api=require("../sales-order-sqlite.ts");
const backup=require("../sales-order-backup-sqlite.ts");
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const auth={organizationId:uuid(1),companyId:uuid(2),branchId:uuid(3),warehouseId:uuid(4),canManageSalesOrders:true};
const request=()=>({...auth,id:uuid(5),operationId:uuid(6),orderNumber:"SO-TRASH",
 customerId:uuid(7),currency:"INR",createdAt:"2026-10-21T06:00:00.000Z",
 lines:[{id:uuid(8),productId:uuid(9),description:"Paper",
 quantityMilli:1000,unitPriceMinor:100,discountMinor:0,taxMinor:0}]});
function db(){
 const raw=new SQL.Database();
 const conn={exec(s,p=[]){raw.run(s,p);},
 query(s,p=[]){const st=raw.prepare(s);try{st.bind(p);let out=[];while(st.step())out.push(st.getAsObject());return out;}finally{st.free()}},
 transaction(fn){raw.run("BEGIN IMMEDIATE");try{let v=fn();raw.run("COMMIT");return v;}catch(e){raw.run("ROLLBACK");throw e;}}};
 api.initializeSalesOrderSqlite(conn,true);return conn;
}
const arch={operationId:uuid(10),action:"archive",expectedVersion:1,
 occurredAt:"2026-10-21T06:01:00.000Z"};
const restore={operationId:uuid(11),action:"restore",expectedVersion:2,
 occurredAt:"2026-10-21T06:02:00.000Z"};
test("draft archive hides from normal listings but is recoverable via Trash",()=>{
 const conn=db();api.createSalesOrderSqlite(conn,request(),auth,true,()=>true);
 const result=api.archiveSalesOrderSqlite(conn,uuid(5),arch,auth,true);
 assert.equal(result.order.version,2);assert.equal(result.order.status,"draft");
 assert.equal(api.listSalesOrdersSqlite(conn,auth,true).length,0);
 assert.equal(api.listSalesOrdersPageSqlite(conn,auth,{},true).orders.length,0);
 assert.equal(api.listArchivedSalesOrdersSqlite(conn,auth,true).length,1);
 assert.equal(api.listPendingSalesOrderEventsSqlite(conn,auth,true).length,2);
 assert.equal(api.archiveSalesOrderSqlite(conn,uuid(5),arch,auth,true).disposition,"replay");
 const restored=api.archiveSalesOrderSqlite(conn,uuid(5),restore,auth,true);
 assert.equal(restored.order.version,3);
 assert.equal(api.listSalesOrdersSqlite(conn,auth,true).length,1);
 assert.equal(api.listArchivedSalesOrdersSqlite(conn,auth,true).length,0);
 assert.equal(api.listPendingSalesOrderEventsSqlite(conn,auth,true).length,3);
});
test("archived record and full event lineage survive isolated backup restore",()=>{
 const source=db(),dest=db();
 api.createSalesOrderSqlite(source,request(),auth,true,()=>true);
 api.archiveSalesOrderSqlite(source,uuid(5),arch,auth,true);
 const save=backup.exportSalesOrderPilotBackupSqlite(source,auth,true);
 assert.equal(save.orders.length,1);
 assert.equal(save.orders[0].deletedAt,arch.occurredAt);
 assert.deepEqual(save.pendingEvents.map(e=>e.eventType),["created","archived"]);
 backup.restoreSalesOrderPilotBackupSqlite(dest,save,auth,true);
 assert.equal(api.listArchivedSalesOrdersSqlite(dest,auth,true).length,1);
 assert.equal(api.listSalesOrdersSqlite(dest,auth,true).length,0);
});
test("archive refuses confirmed sales and cannot be used as financial reversal",()=>{
 const conn=db();
 api.createSalesOrderSqlite(conn,request(),auth,true,()=>true);
 api.transitionSalesOrderSqlite(conn,uuid(5),{
 operationId:uuid(20),action:"confirm",expectedVersion:1,
 occurredAt:"2026-10-21T06:01:00.000Z"},auth,true,undefined,()=>true);
 assert.throws(()=>api.archiveSalesOrderSqlite(conn,uuid(5),{...arch,expectedVersion:2},auth,true),/Confirmed or invoiced/);
 assert.equal(api.listSalesOrdersSqlite(conn,auth,true)[0].status,"confirmed");
 assert.equal(api.listPendingSalesOrderEventsSqlite(conn,auth,true).length,2);
});
test("wrong scope, stale version, disabled toggle leave live orders unchanged",()=>{
 const conn=db();api.createSalesOrderSqlite(conn,request(),auth,true,()=>true);
 assert.throws(()=>api.archiveSalesOrderSqlite(conn,uuid(5),arch,auth),/disabled/);
 assert.throws(()=>api.archiveSalesOrderSqlite(conn,uuid(5),arch,
 {...auth,branchId:uuid(50)},true),/scope mismatch/);
 assert.throws(()=>api.archiveSalesOrderSqlite(conn,uuid(5),{...arch,expectedVersion:2},auth,true),/Stale/);
 assert.equal(api.listSalesOrdersSqlite(conn,auth,true).length,1);
 assert.equal(api.listPendingSalesOrderEventsSqlite(conn,auth,true).length,1);
});
