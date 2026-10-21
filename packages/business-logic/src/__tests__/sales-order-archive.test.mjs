import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";import{createRequire}from"node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),
 {fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {planSalesOrderCreate,planSalesOrderTransition}=require("../sales-order-intent.ts");
const {planSalesOrderArchive}=require("../sales-order-archive.ts");
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const auth={organizationId:uuid(1),companyId:uuid(2),branchId:uuid(3),
 warehouseId:uuid(4),canManageSalesOrders:true};
const draft=()=>planSalesOrderCreate({...auth,id:uuid(5),operationId:uuid(6),
 orderNumber:"SO-TRASH-001",customerId:uuid(7),currency:"INR",
 createdAt:"2026-10-21T05:00:00.000Z",
 lines:[{id:uuid(8),productId:uuid(9),description:"Paper",
 quantityMilli:1000,unitPriceMinor:100,discountMinor:0,taxMinor:0}]},auth,[],true).order;
const archive={action:"archive",operationId:uuid(10),expectedVersion:1,
 occurredAt:"2026-10-21T05:01:00.000Z"};
const restore={action:"restore",operationId:uuid(11),expectedVersion:2,
 occurredAt:"2026-10-21T05:02:00.000Z"};
test("draft archival and restore are CAS, idempotent, lossless",()=>{
 const before=draft();
 assert.throws(()=>planSalesOrderArchive(before,archive,auth),/disabled/);
 const first=planSalesOrderArchive(before,archive,auth,true).order;
 assert.equal(first.deletedAt,archive.occurredAt);
 assert.equal(first.version,2);
 assert.equal(before.deletedAt,null);
 assert.equal(planSalesOrderArchive(first,archive,auth,true).disposition,"replay");
 assert.throws(()=>planSalesOrderArchive(first,{...archive,action:"restore"},auth,true),/key reused/);
 const recovered=planSalesOrderArchive(first,restore,auth,true).order;
 assert.equal(recovered.deletedAt,null);
 assert.equal(recovered.version,3);
 assert.equal(recovered.totalMinor,before.totalMinor);
 assert.equal(planSalesOrderArchive(recovered,restore,auth,true).disposition,"replay");
});
test("confirmed orders cannot be hidden in Trash or bypass financial reversal",()=>{
 const a=draft();
 const b=planSalesOrderTransition(a,{action:"confirm",operationId:uuid(22),
 expectedVersion:1,occurredAt:"2026-10-21T05:00:30.000Z"},auth,true).order;
 assert.throws(()=>planSalesOrderArchive(b,{...archive,expectedVersion:2},auth,true),/Confirmed or invoiced/);
});
test("wrong tenant, role, stale version and invalid time fail closed",()=>{
 const a=draft();
 assert.throws(()=>planSalesOrderArchive(a,archive,{...auth,canManageSalesOrders:false},true),/permission denied/);
 assert.throws(()=>planSalesOrderArchive(a,archive,{...auth,branchId:uuid(40)},true),/scope mismatch/);
 assert.throws(()=>planSalesOrderArchive(a,{...archive,expectedVersion:2},auth,true),/Stale/);
 assert.throws(()=>planSalesOrderArchive(a,{...archive,occurredAt:"invalid"},auth,true),/Invalid/);
 assert.throws(()=>planSalesOrderArchive(a,{...restore,expectedVersion:1},auth,true),/not archived/);
});
