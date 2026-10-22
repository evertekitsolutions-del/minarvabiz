import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
const filename=require.resolve("../service-job-cost-report.ts");
const extension=require.extensions[".ts"];
const oldLoad=Module._load;
require.extensions[".ts"]=(mod,file)=>mod._compile(
  ts.transpileModule(fs.readFileSync(file,"utf8"),{fileName:file,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText,file);
Module._load=function(request,parent,isMain){
  if(parent?.filename===filename&&request==="@minarvabiz/utils")
    return {toMinorUnits:n=>{
        const minor=Math.round(n*100);
        if(!Number.isSafeInteger(minor))throw new Error("Money exceeds safe integer range");
        return minor;
      },
      addMinorUnits:(...vals)=>vals.reduce((s,n)=>s+n,0),
      subtractMinorUnits:(a,b)=>a-b};
  return oldLoad.apply(this,arguments);
};
let p;
try{delete require.cache[filename];p=require(filename);}
finally{
  Module._load=oldLoad;
  if(extension)require.extensions[".ts"]=extension;else delete require.extensions[".ts"];
}
function order(id="o1",overrides={}){
  return {id,orderNumber:"SVC-"+id,customerId:"c1",
    customerName:"Customer Name",serviceType:"ladies_tailoring",
    status:"processing",branchId:"b1",price:1000,
    externalMaterialCost:200,orderExpensesTotal:100,
    ...overrides};
}
function part(id,amount,status="used"){
  return {id,totalCostMinor:amount,status};
}
function visit(id="v1",orderId="o1",overrides={}){
  return {id,orderId,branchId:"b1",status:"arrived",
    parts:[part("p-"+id,15000)],...overrides};
}
test("SVC-013 one order revenue is counted once across multiple technician visits",()=>{
  const r=p.calculateServiceJobCostReport([order()],
    [visit("v1"),visit("v2")]);
  assert.equal(r.jobCount,1);
  assert.equal(r.visitCount,2);
  assert.equal(r.totalOrderValueMinor,100000);
  assert.equal(r.existingCostsMinor,30000);
  assert.equal(r.recordedPartsCostMinor,30000);
  assert.equal(r.lowerEstimatedProfitMinor,40000);
  assert.equal(r.upperEstimatedProfitMinor,70000);
  assert.equal(r.rows[0].lowerMarginPercent,40);
  assert.equal(r.rows[0].upperMarginPercent,70);
});
test("SVC-013 separates existing costs from unverified cost-overlap range",()=>{
  const r=p.calculateServiceJobCostReport([order("o1",{
    price:450,externalMaterialCost:250,orderExpensesTotal:175,
  })],[visit()]);
  assert.deepEqual([r.rows[0].lowerEstimatedProfitMinor,
    r.rows[0].upperEstimatedProfitMinor],[-12500,2500]);
  assert.equal(r.rows[0].lowerMarginPercent,-27.78);
  assert.equal(r.rows[0].upperMarginPercent,5.56);
});
test("SVC-013 corrected/voided usage does not add cost again",()=>{
  const r=p.calculateServiceJobCostReport([order()],[visit("v1","o1",{
    parts:[part("p1",3000,"used"),part("p2",2000,"voided")],
  })]);
  assert.equal(r.rows[0].partsUsedCostMinor,3000);
  assert.equal(r.rows[0].partLineCount,1);
  assert.equal(r.rows[0].correctedPartLines,1);
});
test("SVC-013 zero-revenue jobs have no artificial percentage or division error",()=>{
  const r=p.calculateServiceJobCostReport([order("o1",{
    price:0,externalMaterialCost:90,orderExpensesTotal:5,
  })],[visit("v1","o1",{parts:[]})]);
  assert.equal(r.rows[0].lowerEstimatedProfitMinor,-9500);
  assert.equal(r.rows[0].upperEstimatedProfitMinor,-9500);
  assert.equal(r.rows[0].lowerMarginPercent,null);
  assert.equal(r.rows[0].upperMarginPercent,null);
});
test("SVC-013 excludes cancelled/deleted orders and cancelled visits",()=>{
  const a=order(),b=order("o2",{status:"cancelled"});
  const c=order("o3",{deletedAt:"2026-10-20T00:00:00.000Z"});
  const r=p.calculateServiceJobCostReport([a,b,c],[
    visit("v1"),visit("v2","o1",{status:"cancelled"}),
    visit("v3","o2"),visit("v4","o3"),visit("v5","missing"),
  ]);
  assert.equal(r.jobCount,1);
  assert.equal(r.excludedVisitCount,4);
  assert.equal(r.visitCount,1);
});
test("SVC-013 source mismatch and duplicate identities reject, not leak other branches",()=>{
  for(const [orders,visits] of [
    [[order()],[visit("v1","o1",{branchId:"another-branch"})]],
    [[order(),order()],[visit()]],
    [[order()],[visit(),visit()]],
    [[order()],[visit("a","o1",{parts:[part("reused",100)]}),
      visit("b","o1",{parts:[part("reused",100)]})]],
    [[order()],[{...visit(),status:"bogus"}]],
  ])assert.throws(()=>p.calculateServiceJobCostReport(orders,visits));
});
test("SVC-013 invalid order amounts fail closed instead of showing false profit",()=>{
  for(const values of [
    {price:-1},{price:Infinity},{price:NaN},
    {externalMaterialCost:-2},{orderExpensesTotal:NaN},
    {price:1e20},{orderExpensesTotal:1e20},
  ])assert.throws(()=>p.calculateServiceJobCostReport([order("o1",values)],[visit()]));
  assert.throws(()=>p.calculateServiceJobCostReport(null,[]));
});
test("SVC-013 multiple jobs reconcile totals and use deterministic worst-margin first sort",()=>{
  const r=p.calculateServiceJobCostReport([
    order("b",{price:200,externalMaterialCost:20,orderExpensesTotal:0}),
    order("a",{price:500,externalMaterialCost:350,orderExpensesTotal:100}),
  ],[
    visit("x","b",{parts:[part("px",2500)]}),
    visit("y","a",{parts:[part("py",4500)]}),
  ]);
  assert.deepEqual(r.rows.map(x=>x.orderId),["a","b"]);
  assert.equal(r.jobCount,2);
  assert.equal(r.totalOrderValueMinor,70000);
  assert.equal(r.existingCostsMinor,47000);
  assert.equal(r.recordedPartsCostMinor,7000);
  assert.equal(r.lowerEstimatedProfitMinor,16000);
  assert.equal(r.upperEstimatedProfitMinor,23000);
});
test("SVC-013 CSV safely escapes malicious spreadsheet formulas and uncertain cost labels",()=>{
  const r=p.calculateServiceJobCostReport([order("x",{
    orderNumber:"=SUM(1,2)",customerName:"@cmd",
  })],[visit("v1","x")]);
  const csv=p.exportServiceJobCostReportCsv(r);
  assert.match(csv,/"'=SUM\(1,2\)"/);
  assert.match(csv,/"'@cmd"/);
  assert.match(csv,/Parts-used cost \(overlap uncertain\)/);
  assert.match(csv,/"550.00"/);
  assert.ok(csv.endsWith("\r\n"));
});
test("SVC-013 only shows to accounting-view users and sources visits from existing branch list",()=>{
  const root=new URL("../../../",import.meta.url);
  const ui=fs.readFileSync(new URL(
    "ui/src/components/orders/ServiceJobCostPanel.tsx",root),"utf8");
  const panel=fs.readFileSync(new URL(
    "ui/src/components/orders/ServiceSiteVisitPanel.tsx",root),"utf8");
  assert.match(ui,/can\("accounting\.view"\)/);
  assert.match(ui,/calculateServiceJobCostReport\(orders,visits\)/);
  assert.match(ui,/exportServiceJobCostReportCsv\(report\)/);
  assert.match(panel,/<ServiceJobCostPanel orders=\{orders\} visits=\{visits\}/);
  assert.match(panel,/visits=listServiceSiteVisits\(\)/);
});
