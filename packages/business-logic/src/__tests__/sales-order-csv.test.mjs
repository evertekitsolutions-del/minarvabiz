import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(
  fs.readFileSync(file,"utf8"),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,
    target:ts.ScriptTarget.ES2022}},).outputText,file);
const {exportSalesOrdersCsv}=require("../sales-order-csv.ts");
const scope={organizationId:"org1",companyId:"comp1",branchId:"branch1",
  warehouseId:"warehouse1",canManageSalesOrders:true};
const make=(patch={})=>({
  ...scope,id:"order-id",orderNumber:"SO-MT-2026-27-00001",
  createdAt:"2026-10-21T10:00:00.000Z",dueDate:"2026-11-01",
  customerId:"cust-1",currency:"INR",status:"confirmed",totalMinor:3850,
  invoiceId:null,note:"Delivery, 5pm",lines:[
    {id:"line1",productId:"sku1",description:'Notebook "Premium"',
      quantityMilli:2000,unitPriceMinor:1500,discountMinor:100,taxMinor:50,
      subtotalMinor:3000,totalMinor:2950},
    {id:"line2",productId:"sku2",description:"=HYPERLINK(\"https://invalid.example\")",
      quantityMilli:1000,unitPriceMinor:900,discountMinor:0,taxMinor:0,
      subtotalMinor:900,totalMinor:900}
  ],...patch
});
test("scoped CSV includes all order lines, numeric minor amounts and inert formula descriptions",()=>{
  const source=make();
  const before=JSON.stringify(source);
  const result=exportSalesOrdersCsv([source],scope,true);
  assert.equal(JSON.stringify(source),before);
  assert.match(result,/^order_number,status,created_at,due_date,customer_id,currency,line_id/);
  assert.equal(result.trim().split("\n").length,3);
  assert.ok(result.includes('"Notebook ""Premium"""'));
  assert.ok(result.includes("'=HYPERLINK("));
  assert.ok(result.includes(",2000,1500,100,50,2950,3850,"));
});
test("CSV is default disabled and blocks unauthorized or mixed-tenant exports",()=>{
  assert.throws(()=>exportSalesOrdersCsv([make()],scope),/disabled/);
  assert.throws(()=>exportSalesOrdersCsv([make()],{...scope,canManageSalesOrders:false},true),/permission denied/);
  assert.throws(()=>exportSalesOrdersCsv([make({branchId:"branch2"})],scope,true),/Cross-scope/);
  assert.throws(()=>exportSalesOrdersCsv([make(),make({organizationId:"org2"})],scope,true),/Cross-scope/);
  assert.throws(()=>exportSalesOrdersCsv([make({lines:[]})],scope,true),/Malformed/);
  assert.throws(()=>exportSalesOrdersCsv([make({totalMinor:NaN})],scope,true),/Invalid/);
  assert.match(exportSalesOrdersCsv([],scope,true),/^order_number/);
});
