import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,"utf8"),
 {fileName:f,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {planSalesOrderCreate}=require("../sales-order-intent.ts");
const {renderSalesOrderPrintHtml}=require("../sales-order-print.ts");
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const auth={organizationId:uuid(1),companyId:uuid(2),branchId:uuid(3),warehouseId:uuid(4),canManageSalesOrders:true};
const order=()=>planSalesOrderCreate({...auth,id:uuid(5),operationId:uuid(6),
 orderNumber:"SO-PRINT-001",customerId:uuid(7),currency:"INR",
 createdAt:"2026-10-21T06:00:00.000Z",note:"Handle carefully",
 lines:[{id:uuid(8),productId:uuid(9),description:"Paper & Stapler",
 quantityMilli:2000,unitPriceMinor:100,discountMinor:10,taxMinor:20}]},auth,[],true).order;
const opts={businessName:"Minarva Biz",customerName:"Sample Customer"};
test("A4 order not tax invoice includes exact totals",()=>{
 const html=renderSalesOrderPrintHtml(order(),auth,opts,true);
 assert.match(html,/size:A4/);assert.match(html,/NOT A TAX INVOICE/);
 assert.match(html,/Paper &amp; Stapler/);assert.match(html,/Total:.*2\.10/);
 assert.match(html,/Handle carefully/);assert.ok(!html.includes("<script"));
});
test("thermal paper and hostile customer labels escaped",()=>{
 const html=renderSalesOrderPrintHtml(order(),auth,{...opts,
 businessName:'<img src=x onerror="evil()">',customerName:"<script>bad()</script>",
 customerAddress:"Floor <3>\nUnit B",paper:"thermal"},true);
 assert.match(html,/size:80mm/);assert.match(html,/&lt;script&gt;/);
 assert.ok(!html.includes("<script>bad()</script>"));
 assert.ok(html.includes("Floor &lt;3&gt;<br>Unit B"));
});
test("scope, roles, tampered totals and paper deny render",()=>{
 assert.throws(()=>renderSalesOrderPrintHtml(order(),auth,opts),/disabled/);
 assert.throws(()=>renderSalesOrderPrintHtml(order(),{...auth,canManageSalesOrders:false},opts,true),/permission denied/);
 assert.throws(()=>renderSalesOrderPrintHtml(order(),{...auth,branchId:uuid(50)},opts,true),/Cross-scope/);
 assert.throws(()=>renderSalesOrderPrintHtml({...order(),totalMinor:1},auth,opts,true),/Corrupt/);
 assert.throws(()=>renderSalesOrderPrintHtml(order(),auth,{...opts,paper:"poster"},true),/paper/);
});
