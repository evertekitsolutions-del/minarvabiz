import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
}).outputText,file);
const {buildLandedCostPreview}=require("../landed-cost-preview.ts");
const line=(id,quantity,amount,desc)=>({id,goodsReceiptId:"g1",purchaseOrderLineId:"p"+id,productId:id,description:desc??id,
  receivedQuantity:quantity,unitCost:quantity===0?0:amount/quantity,lineTotal:amount});
const grn={id:"g1",grnNumber:"GRN-001",purchaseOrderId:"po1",poNumber:"PO-1",supplierId:"s1",
  receiptDate:"2026-10-21",branchId:"b1",
  lines:[line("a",1,100),line("b",3,300)],subtotal:400};
const costs={freight:"19.99",insurance:"0.01",customsDuty:"0",other:"0"};
const run=(method="value",receipt=grn,override=costs,branch="b1")=>
  buildLandedCostPreview(receipt,{method,costs:override},branch);

test("allocate four charge types exactly by receipt value",()=>{
  const before=JSON.stringify([grn,costs]);
  const p=run();
  assert.deepEqual(p.rows.map(x=>x.allocatedExtraCost),[5,15]);
  assert.deepEqual(p.rows.map(x=>x.landedCost),[105,315]);
  assert.deepEqual(p.rows.map(x=>x.landedUnitCost),[105,105]);
  assert.deepEqual([p.baseSubtotal,p.additionalCosts,p.estimatedLandedTotal],[400,20,420]);
  assert.equal(JSON.stringify([grn,costs]),before);
});

test("quantity allocation changes weights without losing money",()=>{
  const r={...grn,lines:[line("a",3,100),line("b",1,300)],subtotal:400};
  const p=run("quantity",r,{freight:"4.01",insurance:"0",customsDuty:"0",other:"0"});
  assert.deepEqual(p.rows.map(x=>x.allocatedExtraCost),[3.01,1]);
  assert.equal(p.estimatedLandedTotal,404.01);
});

test("largest remainders distribute cents predictably independent of input order",()=>{
  const receipt={...grn,lines:[line("c",1,1),line("a",1,1),line("b",1,1)],subtotal:3};
  const extra={freight:"0.02",insurance:"0",customsDuty:"0",other:"0"};
  const a=run("value",receipt,extra),b=run("value",{...receipt,lines:[...receipt.lines].reverse()},extra);
  const canon=p=>Object.fromEntries(p.rows.map(r=>[r.receiptLineId,r.allocatedExtraCost]));
  assert.deepEqual(canon(a),{c:0,a:0.01,b:0.01});
  assert.deepEqual(canon(a),canon(b));
});

test("fractional quantities allocate by 0.001 unit precision",()=>{
  const r={...grn,lines:[line("a",0.125,10),line("b",0.375,30)],subtotal:40};
  const p=run("quantity",r,{freight:"1.00",insurance:"0",customsDuty:"0",other:"0"});
  assert.deepEqual(p.rows.map(x=>x.allocatedExtraCost),[0.25,0.75]);
  assert.deepEqual(p.rows.map(x=>x.landedUnitCost),[82,82]);
});

test("reject mismatched branch, stale subtotal, duplicate lines and invalid receipt",()=>{
  assert.throws(()=>run("value",{...grn,branchId:"b2"}),/branch/);
  assert.throws(()=>run("value",{...grn,subtotal:300}),/subtotal/);
  assert.throws(()=>run("value",{...grn,lines:[grn.lines[0],grn.lines[0]],subtotal:200}),/Duplicate/);
  assert.throws(()=>run("value",{...grn,lines:[]}),/non-empty/);
  assert.throws(()=>run("value",{...grn,lines:[line("a",0,100)],subtotal:100}),/quantity/);
  assert.throws(()=>run("value",{...grn,lines:[line("a",0.0001,100)],subtotal:100}),/decimal/);
});

test("reject imprecise, negative, overflow, invalid extra costs, and zero-value method",()=>{
  for(const v of ["-1","0.001","1e4","1,000","9007199254740999","Infinity", ""]){
    assert.throws(()=>run("quantity",grn,{...costs,freight:v}),/Freight/);
  }
  assert.throws(()=>run("bogus"),/method/);
  const emptyValues={...grn,lines:[line("a",1,0),line("b",1,0)],subtotal:0};
  assert.throws(()=>run("value",emptyValues),/Zero-value/);
  assert.equal(run("quantity",emptyValues,{freight:"0.01",insurance:"0",customsDuty:"0",other:"0"}).estimatedLandedTotal,0.01);
});

test("CSV neutralizes formulas and returns all authorized receipt lines",()=>{
  const r={...grn,lines:[line("a",1,100,'=BAD,\n"formula"'),line("b",3,300)],subtotal:400};
  const p=run("value",r);
  assert.match(p.csv,/"'=BAD,\n""formula"""/);
  assert.equal(p.csv.split("\r\n").length-2,2);
});

test("Procurement UI mounts read-only landed cost calculator",()=>{
  const panel=fs.readFileSync(new URL("../../../ui/src/components/purchases/LandedCostPanel.tsx",import.meta.url),"utf8");
  const host=fs.readFileSync(new URL("../../../ui/src/components/purchases/ProcurementPanel.tsx",import.meta.url),"utf8");
  assert.match(panel,/Preview landed cost/);
  assert.match(panel,/Export landed cost CSV/);
  assert.match(panel,/buildLandedCostPreview/);
  assert.match(host,/<LandedCostPanel/);
});
