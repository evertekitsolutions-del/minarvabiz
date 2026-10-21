import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(
  fs.readFileSync(file,"utf8"),{fileName:file,compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
    inlineSourceMap:true,inlineSources:true,
  }}).outputText,file);
const {planSalesOrderCreate}=require("../sales-order-intent.ts");
const {exportSalesOrdersCsv}=require("../sales-order-csv.ts");
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const scope={organizationId:uuid(1),companyId:uuid(2),branchId:uuid(3),
  warehouseId:uuid(4),canManageSalesOrders:true};
function make(patch={}) {
  const request={...scope,id:uuid(5),operationId:uuid(6),
    orderNumber:"SO-MT-2026-27-00001",
    createdAt:"2026-10-21T10:00:00.000Z",dueDate:"2026-11-01",
    customerId:uuid(7),currency:"INR",note:"Delivery, 5pm",lines:[
      {id:uuid(8),productId:uuid(9),description:'Notebook "Premium"',
        quantityMilli:2000,unitPriceMinor:1500,discountMinor:100,taxMinor:50},
      {id:uuid(10),productId:uuid(11),
        description:'=HYPERLINK("https://invalid.example")',
        quantityMilli:1000,unitPriceMinor:900,discountMinor:0,taxMinor:0},
    ]};
  return {...planSalesOrderCreate(request,scope,[],true).order,...patch};
}
test("scoped CSV exports verified line totals and inert formula descriptions",()=>{
  const source=make();
  const before=JSON.stringify(source);
  const result=exportSalesOrdersCsv([source],scope,true);
  assert.equal(JSON.stringify(source),before);
  assert.match(result,/^order_number,status,created_at,due_date,customer_id,currency,line_id/);
  assert.equal(result.trim().split("\\n").length,3);
  assert.ok(result.includes('"Notebook ""Premium"""'));
  assert.ok(result.includes("'=HYPERLINK("));
  assert.ok(result.includes(",2000,1500,100,50,2950,3850,"));
});
test("CSV stays opt-in, scope-bound and rejects duplicate financial rows",()=>{
  const original=make();
  assert.throws(()=>exportSalesOrdersCsv([original],scope),/disabled/);
  assert.throws(()=>exportSalesOrdersCsv([original],
    {...scope,canManageSalesOrders:false},true),/permission denied/);
  assert.throws(()=>exportSalesOrdersCsv([make({branchId:uuid(30)})],scope,true),/Cross-scope/);
  assert.throws(()=>exportSalesOrdersCsv([original,make({organizationId:uuid(31)})],
    scope,true),/Cross-scope/);
  assert.throws(()=>exportSalesOrdersCsv([original,original],scope,true),/Duplicate/);
  assert.match(exportSalesOrdersCsv([],scope,true),/^order_number/);
});
test("CSV refuses forged totals, line identity, missing baseline and invalid revisions",()=>{
  const source=make();
  for(const bad of [
    {...source,totalMinor:3851},
    {...source,lines:[]},
    {...source,lines:[{...source.lines[0],totalMinor:3000},source.lines[1]]},
    {...source,originalCreatePayload:"not-json"},
    {...source,version:0},
    {...source,lines:[source.lines[0],source.lines[0]]},
  ]) assert.throws(()=>exportSalesOrdersCsv([bad],scope,true),/Corrupt/);
});
