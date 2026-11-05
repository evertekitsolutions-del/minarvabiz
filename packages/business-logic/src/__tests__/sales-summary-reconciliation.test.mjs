import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url), ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{
  fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,filename);
const { calculateRetailReportMovement } = require("../sales-summary-reconciliation.ts");
const store=require("../store.ts");
const orders=require("../orders-store.ts");
const phase5=require("../phase5-store.ts");
const phase6=require("../phase6-store.ts");
const phase7=require("../phase7-store.ts");
const line=(quantity=2,taxRate=0,lineTotal=200)=>({
 id:"i1",saleId:"s1",productId:"p1",productName:"Dress",quantity,costPrice:60,
 unitPrice:100,discountPercent:0,taxRate,lineTotal
});
const sale=(patch={})=>({
 id:"s1",invoiceNumber:"INV1",status:"partial",saleDate:"2026-11-01T10:00:00Z",
 total:100,taxAmount:0,items:[line()],customerId:null,paidAmount:100,balanceAmount:0,...patch
});
const returned=(restock=true,patch={})=>({
 id:"r1",saleId:"s1",createdAt:"2026-11-02T10:00:00Z",status:"completed",
 totalRefund:100,items:[{saleItemId:"i1",productId:"p1",quantity:1,
 refundAmount:100,restock}],...patch
});
const every=()=>true;
const on=(day)=>(stamp)=>stamp.startsWith(day);
test("retail net revenue and COGS reconcile across dates, a sellable return and a nonrestocked return",()=>{
 const s=sale(),r=returned();
 assert.deepEqual(calculateRetailReportMovement([s],[r],every),{productSales:100,inventoryCogs:60});
 assert.deepEqual(calculateRetailReportMovement([s],[r],on("2026-11-01")),{productSales:200,inventoryCogs:120});
 assert.deepEqual(calculateRetailReportMovement([s],[r],on("2026-11-02")),{productSales:-100,inventoryCogs:-60});
 assert.deepEqual(calculateRetailReportMovement([s],[returned(false)],every),{productSales:100,inventoryCogs:120});
 assert.deepEqual(calculateRetailReportMovement([sale({status:"returned",total:0})],
  [returned(true,{totalRefund:200,items:[{saleItemId:"i1",productId:"p1",quantity:2,refundAmount:200,restock:true}]})],
  every),{productSales:0,inventoryCogs:0});
});
test("GST from original invoice is excluded from revenue and proportionally reversed",()=>{
 const s=sale({total:118,taxAmount:36,items:[line(2,18,236)]});
 const r=returned(true,{totalRefund:118,items:[{saleItemId:"i1",productId:"p1",quantity:1,refundAmount:118,restock:true}]});
 assert.deepEqual(calculateRetailReportMovement([s],[r],every),{productSales:100,inventoryCogs:60});
 assert.deepEqual(calculateRetailReportMovement([s],[r],on("2026-11-01")),{productSales:200,inventoryCogs:120});
 assert.deepEqual(calculateRetailReportMovement([s],[r],on("2026-11-02")),{productSales:-100,inventoryCogs:-60});
});
test("the operational sales and day-end reports count a posted order-linked expense once",()=>{
 const savedCore=store.exportCoreState();
 const savedOrders=orders.exportOrdersState();
 const savedPhase5=phase5.exportPhase5State();
 const savedPhase7=phase7.exportPhase7State();
 try{
  store.hydrateCore({products:[],customers:[],sales:[],payments:[]});
  orders.hydrateOrders({orders:[{
   id:"o1",orderDate:new Date().toISOString().slice(0,10),status:"pending",
   price:1500,externalMaterialCost:0,orderExpensesTotal:100,
   expenses:[{id:"e1",description:"Tailoring material",amount:100}],branchId:null
  }]});
  phase5.hydratePhase5({expenses:[{id:"e1",orderId:"o1",date:new Date().toISOString().slice(0,10),
    amount:100,categoryId:"ec-1",paymentMethod:"cash",description:"Tailoring material",deletedAt:null
  }],purchases:[],laundryOrders:[]});
  phase7.hydratePhase7({returns:[]});
  const summary=phase7.salesReport()[0];
  assert.equal(summary.totalRevenue,1500);
  assert.equal(summary.expenses,100);
  assert.equal(summary.netProfit,1400);
  const day=phase7.dayEndReport();
  assert.equal(day.totalExpenses,100);
  assert.equal(day.netProfit,1400);
 }finally{
  phase7.hydratePhase7(savedPhase7);
  phase5.hydratePhase5(savedPhase5);
  orders.hydrateOrders(savedOrders);
  store.hydrateCore(savedCore);
 }
});
