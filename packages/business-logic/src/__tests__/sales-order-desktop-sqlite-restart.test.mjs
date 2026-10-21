import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const dbRequire=createRequire(new URL("../../../database/package.json",import.meta.url));
const ts=require("typescript");
require.extensions[".ts"]=(mod,path)=>mod._compile(ts.transpileModule(fs.readFileSync(path,"utf8"),
 {fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,
 target:ts.ScriptTarget.ES2022}}).outputText,path);
const {openSqliteDatabase}=dbRequire("./src/adapters/sqlite-browser.ts");
const pilot=require("../sales-order-sqlite.ts");
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const auth={organizationId:uuid(1),companyId:uuid(2),branchId:uuid(3),
 warehouseId:uuid(4),canManageSalesOrders:true};
const req=()=>({...auth,id:uuid(5),operationId:uuid(6),orderNumber:"SO-RESTART-001",
 customerId:uuid(7),currency:"INR",createdAt:"2026-10-21T05:00:00.000Z",
 lines:[{id:uuid(8),productId:uuid(9),description:"Notebook",
   quantityMilli:2000,unitPriceMinor:100,discountMinor:0,taxMinor:0}]});
const confirm={action:"confirm",operationId:uuid(12),expectedVersion:1,
 occurredAt:"2026-10-21T05:01:00.000Z"};
function storage(){
 let bin=null;
 const io={readFile(){return bin;},writeFile(_p,b){bin=new Uint8Array(b);},
   exists(){return bin!==null},mkdirp(){}};
 return {io,raw:()=>bin};
}
test("shipping browser SQLite adapter preserves order and pending event across restart",async()=>{
 const {io,raw}=storage();
 let db=await openSqliteDatabase("minarva-restart-test.db",io);
 pilot.initializeSalesOrderSqlite(db,true);
 pilot.createSalesOrderSqlite(db,req(),auth,true,()=>true);
 pilot.transitionSalesOrderSqlite(db,uuid(5),confirm,auth,true,undefined,()=>true);
 assert.ok(raw()?.length>0,"transaction committed a durable binary");
 db.close();
 db=await openSqliteDatabase("minarva-restart-test.db",io);
 const saved=pilot.listSalesOrdersSqlite(db,auth,true);
 assert.equal(saved.length,1);
 assert.equal(saved[0].status,"confirmed");
 assert.equal(saved[0].totalMinor,200);
 const events=pilot.listPendingSalesOrderEventsSqlite(db,auth,true);
 assert.deepEqual(events.map(e=>e.eventType),["created","confirmed"]);
 assert.equal(pilot.createSalesOrderSqlite(db,req(),auth,true,()=>true).disposition,"replay");
 assert.equal(pilot.transitionSalesOrderSqlite(db,uuid(5),confirm,auth,true,undefined,()=>true).disposition,"replay");
 assert.equal(pilot.listPendingSalesOrderEventsSqlite(db,auth,true).length,2);
 db.close();
});
test("crashed financial transaction cannot persist phantom invoice or event across restart",async()=>{
 const {io}=storage();
 let db=await openSqliteDatabase("minarva-recovery-test.db",io);
 pilot.initializeSalesOrderSqlite(db,true);
 pilot.createSalesOrderSqlite(db,req(),auth,true,()=>true);
 pilot.transitionSalesOrderSqlite(db,uuid(5),confirm,auth,true,undefined,()=>true);
 assert.throws(()=>db.transaction(()=>{
   db.exec("UPDATE retail_sales_order_intents_v1 SET status='cancelled',version=9 WHERE id=?",[uuid(5)]);
   throw new Error("simulated process failure during transaction");
 }),/simulated process failure/);
 db.close();
 db=await openSqliteDatabase("minarva-recovery-test.db",io);
 assert.equal(pilot.listSalesOrdersSqlite(db,auth,true)[0].status,"confirmed");
 assert.equal(pilot.listPendingSalesOrderEventsSqlite(db,auth,true).length,2);
 db.close();
});
test("restarted file remains branch-isolated and permission-checked",async()=>{
 const {io}=storage();
 let db=await openSqliteDatabase("minarva-scope-test.db",io);
 pilot.initializeSalesOrderSqlite(db,true);
 pilot.createSalesOrderSqlite(db,req(),auth,true,()=>true);
 db.close();
 db=await openSqliteDatabase("minarva-scope-test.db",io);
 assert.equal(pilot.listSalesOrdersSqlite(db,{...auth,branchId:uuid(90)},true).length,0);
 assert.throws(()=>pilot.listSalesOrdersSqlite(db,{...auth,canManageSalesOrders:false},true),/permission denied/);
 assert.throws(()=>pilot.listSalesOrdersSqlite(db,auth),/disabled/);
 db.close();
});
