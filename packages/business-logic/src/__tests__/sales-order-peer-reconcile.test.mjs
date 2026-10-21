import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const dbRequire=createRequire(new URL("../../../database/package.json",import.meta.url));
const ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),
 {fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const SQL=await dbRequire("sql.js/dist/sql-asm.js")();
const api=require("../sales-order-sqlite.ts");
const sync=require("../sales-order-sync-receipt-sqlite.ts");
const {previewSalesOrderPeerReconciliationSqlite:preview}=require("../sales-order-peer-reconcile.ts");
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const auth={organizationId:uuid(1),companyId:uuid(2),branchId:uuid(3),
 warehouseId:uuid(4),canManageSalesOrders:true};
function database(){
 const raw=new SQL.Database();
 const db={exec(sql,p=[]){raw.run(sql,p);},query(sql,p=[]){const s=raw.prepare(sql);try{s.bind(p);let rows=[];while(s.step())rows.push(s.getAsObject());return rows;}finally{s.free()}},
 transaction(fn){raw.run("BEGIN IMMEDIATE");try{const r=fn();raw.run("COMMIT");return r;}catch(e){raw.run("ROLLBACK");throw e;}}};
 api.initializeSalesOrderSqlite(db,true);return db;
}
const request=()=>({...auth,id:uuid(5),operationId:uuid(6),orderNumber:"SO-PEER-1",
 customerId:uuid(7),currency:"INR",createdAt:"2026-10-21T06:00:00.000Z",
 lines:[{id:uuid(8),productId:uuid(9),description:"Paper",quantityMilli:1000,
  unitPriceMinor:100,discountMinor:0,taxMinor:0}]});
function seeded(){
 const db=database();
 api.createSalesOrderSqlite(db,request(),auth,true,()=>true);
 api.transitionSalesOrderSqlite(db,uuid(5),{operationId:uuid(10),
 expectedVersion:1,action:"confirm",occurredAt:"2026-10-21T06:01:00.000Z"},
 auth,true,undefined,()=>true);
 return db;
}
const peer=(order)=>({order,cursor:"server:42"});
const verified=()=>true;
function ack(db,version){
 const e=api.listSalesOrderEventHistorySqlite(db,auth,true)[version-1];
 sync.acknowledgeSalesOrderCloudEventSqlite(db,{
  ...auth,serverReceiptId:uuid(50+version),orderId:e.orderId,operationId:e.operationId,
  orderVersion:e.orderVersion,eventType:e.eventType,receivedAt:"2026-10-21T06:03:00.000Z",event:e,
 },auth,true,verified);
}
test("unacknowledged equal peer is never incorrectly marked synced",()=>{
 const db=seeded(),before=api.listSalesOrdersSqlite(db,auth,true)[0];
 const result=preview(db,[peer(before)],auth,true,verified);
 assert.equal(result.decisions[0].state,"unacknowledged-equal");
 assert.equal(result.decisions[0].localPendingOperations,2);
 assert.equal(api.listPendingSalesOrderEventsSqlite(db,auth,true).length,2);
 assert.deepEqual(api.listSalesOrdersSqlite(db,auth,true)[0],before);
});
test("same-version divergent amount, remote-ahead and local-ahead fail safe",()=>{
 const db=seeded(),local=api.listSalesOrdersSqlite(db,auth,true)[0];
 const divergent={...local,note:"Modified on another device"};
 const conflict=preview(db,[peer(divergent)],auth,true,verified);
 assert.equal(conflict.decisions[0].state,"conflict");
 const higher={...local,version:3,updatedAt:"2026-10-21T06:02:00.000Z",
 lastOperationId:uuid(14)};
 assert.equal(preview(db,[peer(higher)],auth,true,verified).decisions[0].state,"conflict");
 const prior=api.listSalesOrderEventHistorySqlite(db,auth,true)[0].order;
 assert.equal(preview(db,[peer(prior)],auth,true,verified).decisions[0].state,"local-ahead");
 ack(db,1);ack(db,2);
 assert.equal(preview(db,[peer(local)],auth,true,verified).decisions[0].state,"unchanged");
 assert.equal(preview(db,[peer(higher)],auth,true,verified).decisions[0].state,"remote-ahead");
 assert.equal(preview(db,[peer(prior)],auth,true,verified).decisions[0].state,"remote-stale");
});
test("new remote order is a preview, not an import; archived and normal scope still isolated",()=>{
 const db=seeded(),current=api.listSalesOrdersSqlite(db,auth,true)[0];
 const imported={...current,id:uuid(31),operationId:uuid(32),lastOperationId:uuid(32),
 originalCreatePayload:JSON.stringify({...JSON.parse(current.originalCreatePayload),
  id:uuid(31),operationId:uuid(32)}),
 orderNumber:"SO-PEER-2"};
 assert.equal(preview(db,[peer(imported)],auth,true,verified).decisions[0].state,"remote-new");
 assert.equal(api.listSalesOrdersSqlite(db,auth,true).length,1);
});
test("missing/false host verification, wrong org and malicious duplicate cursor deny",()=>{
 const db=seeded(),local=api.listSalesOrdersSqlite(db,auth,true)[0];
 assert.throws(()=>preview(db,[peer(local)],auth,true),/verifier required/);
 assert.throws(()=>preview(db,[peer(local)],auth,true,()=>false),/verification denied/);
 assert.throws(()=>preview(db,[peer(local)],auth),/disabled/);
 assert.throws(()=>preview(db,[peer(local)],{...auth,canManageSalesOrders:false},true,verified),/permission denied/);
 assert.throws(()=>preview(db,[peer({...local,branchId:uuid(98)})],auth,true,verified),/Cross-scope/);
 assert.throws(()=>preview(db,[peer(local),peer(local)],auth,true,verified),/Duplicate/);
 assert.throws(()=>preview(db,[{order:local,cursor:"<script>"}],auth,true,verified),/cursor/);
 assert.equal(api.listPendingSalesOrderEventsSqlite(db,auth,true).length,2);
});
test("per-branch remote visibility is denied, and outputs contain no unrelated records",()=>{
 const db=seeded(),local=api.listSalesOrdersSqlite(db,auth,true)[0];
 assert.throws(()=>preview(db,[peer(local)],{...auth,branchId:uuid(60)},true,verified),/Cross-scope/);
 assert.deepEqual(preview(db,[],auth,true,verified).decisions,[]);
});
