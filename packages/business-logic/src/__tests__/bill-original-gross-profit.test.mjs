import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(
  ts.transpileModule(fs.readFileSync(file,"utf8"),{
    fileName:file,compilerOptions:{
      module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,
    },
  }).outputText,file);
const {calculateBillOriginalGrossProfit,listAuthorizedBillOriginalGrossProfit}=
  require("../bill-original-gross-profit.ts");
const {setCurrentRole}=require("../permissions.ts");
const store=require("../store.ts");
const sale=(id,cost,patch={})=>({
 id,invoiceNumber:"INV-"+id,customerId:"c1",customerName:"Acme",
 saleDate:"2026-10-21T11:00:00Z",status:"completed",
 subtotal:100,discountAmount:0,taxAmount:18,total:118,
 paidAmount:118,balanceAmount:0,createdAt:"2026-10-21T11:00:00Z",
 version:1,items:[{
  id:"item-"+id,saleId:id,productId:"p1",productName:"Product",
  quantity:1,costPrice:cost,unitPrice:100,discountPercent:0,taxRate:18,lineTotal:118,
 }],...patch,
});
test("FIN-026 billwise posted margin uses original historical costs and excludes tax",()=>{
 const r=calculateBillOriginalGrossProfit([
   sale("1",40),sale("2",120,{status:"partial",customerName:null}),
   sale("draft",1,{status:"draft"}),sale("returned",1,{status:"returned"}),
   sale("deleted",1,{deletedAt:"2026-10-22"}),
 ]);
 assert.equal(r.invoiceCount,2);
 assert.equal(r.revenueExcludingTax,200);
 assert.equal(r.historicalCost,160);
 assert.equal(r.originalGrossProfit,40);
 assert.equal(r.marginPercent,20);
 assert.equal(r.rows.find(x=>x.saleId==="1").originalGrossProfit,60);
 assert.equal(r.rows.find(x=>x.saleId==="2").originalGrossProfit,-20);
 assert.equal(r.rows.find(x=>x.saleId==="2").customerName,"Walk-in");
 assert.equal(r.rows[0].invoiceDate,"2026-10-21");
});
test("date filter and invalid stored invoice totals fail closed",()=>{
 const one=sale("1",40);
 assert.equal(calculateBillOriginalGrossProfit([one],"2026-10-22").invoiceCount,0);
 assert.equal(calculateBillOriginalGrossProfit([one],"2026-10-21","2026-10-21").invoiceCount,1);
 for(const [from,to] of [["2026-02-30",undefined],["invalid",undefined],["2026-12-01","2026-10-01"]]){
   assert.throws(()=>calculateBillOriginalGrossProfit([one],from,to));
 }
 assert.throws(()=>calculateBillOriginalGrossProfit([{...one,total:999}]),/inconsistent/);
 assert.throws(()=>calculateBillOriginalGrossProfit([sale("a",-1)]),/historical/);
 assert.deepEqual(calculateBillOriginalGrossProfit([],undefined,undefined).rows,[]);
});
test("no cashier access and no cross-branch profit leak",()=>{
 const before=store.exportCoreState();
 try{
  store.hydrateCore({sales:[sale("1",40)]});
  for(const role of ["cashier","staff","tailor"]){
    setCurrentRole(role);
    assert.throws(()=>listAuthorizedBillOriginalGrossProfit(),/Permission denied/);
  }
  for(const role of ["manager","admin","super_admin"]){
    setCurrentRole(role);
    assert.equal(listAuthorizedBillOriginalGrossProfit().originalGrossProfit,60);
  }
  store.hydrateCore({sales:[sale("foreign",40,{branchId:"foreign"})]});
  assert.equal(listAuthorizedBillOriginalGrossProfit().invoiceCount,0);
 }finally{
  setCurrentRole(null);
  store.hydrateCore(before);
 }
});
test("shared reports include bill-wise invoice profit with restricted exports",()=>{
 const s=fs.readFileSync(new URL("../../../ui/src/components/reports/ReportsPanel.tsx",import.meta.url),"utf8");
 assert.match(s,/bill-profit/);
 assert.match(s,/listAuthorizedBillOriginalGrossProfit/);
 assert.match(s,/mayReadBillProfits = can\("accounting.view"\)/);
 assert.match(s,/Original invoice gross profit/);
});
