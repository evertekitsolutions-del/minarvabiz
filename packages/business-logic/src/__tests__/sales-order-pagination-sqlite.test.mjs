import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const sqliteRequire=createRequire(new URL("../../../database/package.json",import.meta.url));
const ts=require("typescript");
require.extensions[".ts"]=(mod,path)=>mod._compile(ts.transpileModule(
  fs.readFileSync(path,"utf8"),{fileName:path,compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}},).outputText,path);
const SQL=await sqliteRequire("sql.js/dist/sql-asm.js")();
const api=require("../sales-order-sqlite.ts");
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const auth={organizationId:uuid(1),companyId:uuid(2),branchId:uuid(3),
  warehouseId:uuid(4),canManageSalesOrders:true};
function db(){
 const raw=new SQL.Database();
 const conn={exec(sql,params=[]){raw.run(sql,params);},
   query(sql,params=[]){const s=raw.prepare(sql);try{s.bind(params);let out=[];while(s.step())out.push(s.getAsObject());return out;}finally{s.free()}},
   transaction(fn){raw.run("BEGIN IMMEDIATE");try{let v=fn();raw.run("COMMIT");return v;}catch(e){raw.run("ROLLBACK");throw e;}}};
 api.initializeSalesOrderSqlite(conn,true);return conn;
}
function request(i,extra={}){
 return {...auth,id:uuid(100+i),operationId:uuid(200+i),
   orderNumber:`SO-${String(i).padStart(3,"0")}`,customerId:uuid(7),currency:"INR",
   createdAt:"2026-10-21T06:00:00.000Z",
   lines:[{id:uuid(300+i),productId:uuid(9),description:"Paper",
     quantityMilli:1000,unitPriceMinor:500,discountMinor:0,taxMinor:0}],...extra};
}
function seed(conn,n=5){
 for(let i=1;i<=n;i++)api.createSalesOrderSqlite(conn,request(i),auth,true,()=>true);
}
test("scope-bound cursor pagination is stable and never skips or duplicates orders",()=>{
 const conn=db();seed(conn,7);
 const visited=[];let after;
 do{
   const next=api.listSalesOrdersPageSqlite(conn,auth,{limit:2,after},true);
   assert.ok(next.orders.length>=1&&next.orders.length<=2);
   visited.push(...next.orders.map(o=>o.orderNumber));
   after=next.nextCursor;
 }while(after);
 assert.deepEqual(visited,Array.from({length:7},(_,i)=>`SO-${String(i+1).padStart(3,"0")}`));
 assert.deepEqual(api.listSalesOrdersPageSqlite(conn,auth,{limit:100},true).orders.map(o=>o.orderNumber),visited);
});
test("status filter and branching cannot reveal another location's order",()=>{
 const conn=db();seed(conn,3);
 api.transitionSalesOrderSqlite(conn,uuid(101),{operationId:uuid(401),
   action:"confirm",expectedVersion:1,occurredAt:"2026-10-21T06:01:00.000Z"},
   auth,true,undefined,()=>true);
 assert.equal(api.listSalesOrdersPageSqlite(conn,auth,{status:"confirmed"},true).orders.length,1);
 assert.equal(api.listSalesOrdersPageSqlite(conn,auth,{status:"draft"},true).orders.length,2);
 assert.equal(api.listSalesOrdersPageSqlite(conn,{...auth,branchId:uuid(70)}, {},true).orders.length,0);
 assert.throws(()=>api.listSalesOrdersPageSqlite(conn,{...auth,canManageSalesOrders:false},{},true),/permission denied/);
});
test("malicious page size, status and cursor fail closed and no mutation occurs",()=>{
 const conn=db();seed(conn,2);
 const bad=[
  {limit:0},{limit:101},{limit:1.5},{limit:Infinity},
  {status:"' OR 1=1 --"},{after:{orderNumber:"'; DROP TABLE orders",id:uuid(101)}},
  {after:{orderNumber:"SO-001",id:"bad-id"}},
 ];
 for(const o of bad)assert.throws(()=>api.listSalesOrdersPageSqlite(conn,auth,o,true),/Invalid/);
 assert.throws(()=>api.listSalesOrdersPageSqlite(conn,auth,{limit:2}),/disabled/);
 assert.equal(api.listSalesOrdersPageSqlite(conn,auth,{},true).orders.length,2);
});
