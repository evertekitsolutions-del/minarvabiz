import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,path)=>mod._compile(ts.transpileModule(fs.readFileSync(path,"utf8"),
  {fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,path);
const {planSalesOrderCreate,planSalesOrderTransition}=require("../sales-order-intent.ts");
const {buildSalesOrderCheckoutCommand}=require("../sales-order-checkout-plan.ts");
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const auth={organizationId:uuid(1),companyId:uuid(2),branchId:uuid(3),warehouseId:uuid(4),
  canManageSalesOrders:true};
const request=()=>({...auth,id:uuid(5),operationId:uuid(6),orderNumber:"SO-BULK-01",
  customerId:uuid(7),currency:"INR",createdAt:"2026-10-21T05:00:00.000Z",
  lines:[
    {id:uuid(11),productId:uuid(8),description:"Cloth cut one",quantityMilli:1200,
      unitPriceMinor:1000,discountMinor:0,taxMinor:0},
    {id:uuid(12),productId:uuid(8),description:"Cloth cut two",quantityMilli:800,
      unitPriceMinor:1000,discountMinor:50,taxMinor:10},
    {id:uuid(13),productId:uuid(9),description:"Thread",quantityMilli:2000,
      unitPriceMinor:100,discountMinor:0,taxMinor:0},
  ]});
const confirmed=()=>{
 const order=planSalesOrderCreate(request(),auth,[],true).order;
 return planSalesOrderTransition(order,{operationId:uuid(15),expectedVersion:1,
   action:"confirm",occurredAt:"2026-10-21T05:01:00.000Z"},auth,true).order;
};
test("two dimensional lines of same SKU form one exact stock debit",()=>{
 const c=buildSalesOrderCheckoutCommand(confirmed(),uuid(20));
 assert.equal(c.lines.length,3);
 assert.deepEqual(c.stockDebits,[{productId:uuid(8),quantityMilli:2000},
   {productId:uuid(9),quantityMilli:2000}]);
 assert.equal(c.totalMinor,2160);
 assert.equal(c.expectedVersion,2);
 assert.equal(c.currency,"INR");
 assert.throws(()=>c.stockDebits.push({productId:uuid(22),quantityMilli:1000}),TypeError);
});
test("checkout rejects draft, unauthorized mutation, invalid op and overflow",()=>{
 const order=planSalesOrderCreate(request(),auth,[],true).order;
 assert.throws(()=>buildSalesOrderCheckoutCommand(order,uuid(20)),/Only confirmed/);
 assert.throws(()=>buildSalesOrderCheckoutCommand(confirmed(),"bad-key"),/Invalid/);
 assert.throws(()=>buildSalesOrderCheckoutCommand({...confirmed(),totalMinor:1},uuid(20)),/Corrupt/);
 const existing=confirmed();
 const big={...existing,lines:[
   {...existing.lines[0],quantityMilli:Number.MAX_SAFE_INTEGER,
     unitPriceMinor:0,subtotalMinor:0,totalMinor:0,discountMinor:0,taxMinor:0},
   {...existing.lines[1],quantityMilli:2,unitPriceMinor:0,
     subtotalMinor:0,totalMinor:0,discountMinor:0,taxMinor:0},
 ],subtotalMinor:0,discountMinor:0,taxMinor:0,totalMinor:0};
 assert.throws(()=>buildSalesOrderCheckoutCommand(big,uuid(20)),/quantity overflow/);
});
