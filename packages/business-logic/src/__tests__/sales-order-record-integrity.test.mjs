import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(
  fs.readFileSync(file,"utf8"),{fileName:file,compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}},).outputText,file);
const {verifySalesOrderRecordIntegrity}=require("../sales-order-record-integrity.ts");
const {planSalesOrderCreate,planSalesOrderDraftAmend,planSalesOrderTransition}=
  require("../sales-order-intent.ts");
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const auth={organizationId:uuid(1),companyId:uuid(2),branchId:uuid(3),
  warehouseId:uuid(4),canManageSalesOrders:true};
const req=()=>({...auth,id:uuid(5),operationId:uuid(6),orderNumber:"SO-003",
  customerId:uuid(7),currency:"INR",createdAt:"2026-10-21T07:00:00.000Z",
  lines:[{id:uuid(8),productId:uuid(9),description:"Sale unit",
    quantityMilli:2500,unitPriceMinor:200,discountMinor:20,taxMinor:50}]});
const order=()=>planSalesOrderCreate(req(),auth,[],true).order;
test("canonical draft, amended and cancelled orders retain valid offline integrity",()=>{
  const a=order();assert.equal(verifySalesOrderRecordIntegrity(a),true);
  const b=planSalesOrderDraftAmend(a,{operationId:uuid(10),expectedVersion:1,
    occurredAt:"2026-10-21T07:01:00.000Z",lines:req().lines,note:"Verified"},auth,true).order;
  assert.equal(verifySalesOrderRecordIntegrity(b),true);
  const c=planSalesOrderTransition(b,{operationId:uuid(11),action:"cancel",
    expectedVersion:2,occurredAt:"2026-10-21T07:02:00.000Z"},auth,true).order;
  assert.equal(verifySalesOrderRecordIntegrity(c),true);
});
test("tampered quantities, totals, version and baseline always fail closed",()=>{
  const base=order();
  const mutations=[
    {...base,totalMinor:999},
    {...base,subtotalMinor:501},
    {...base,taxMinor:55},
    {...base,discountMinor:21},
    {...base,version:0},
    {...base,createdAt:"invalid"},
    {...base,updatedAt:"2025-01-01T00:00:00.000Z"},
    {...base,originalCreatePayload:"not-json"},
    {...base,originalCreatePayload:JSON.stringify({...JSON.parse(base.originalCreatePayload),branchId:uuid(50)})},
    {...base,lines:[{...base.lines[0],quantityMilli:3000}]},
    {...base,lines:[{...base.lines[0],totalMinor:480}]},
    {...base,lines:[base.lines[0],base.lines[0]]},
    {...base,lines:[{...base.lines[0],quantityMilli:1001}]},
    {...base,status:"invoiced",invoiceId:null},
    {...base,status:"draft",invoiceId:uuid(20)},
  ];
  for(const bad of mutations) assert.throws(()=>verifySalesOrderRecordIntegrity(bad),/Corrupt/);
  assert.equal(verifySalesOrderRecordIntegrity(base),true);
});
