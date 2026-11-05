import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,file);
const rfq=require("../procurement-rfq.ts");
const procurement=require("../procurement-store.ts");
const phase5=require("../phase5-store.ts");
const store=require("../store.ts");
const branches=require("../phase9-store.ts");
const accounting=require("../accounting-store.ts");
const permissions=require("../permissions.ts");
const outbox=require("../outbox-bridge.ts");

const product=(id,costPrice=100)=>({
  id,name:"Camera "+id,sku:"CAM-"+id,unit:"pcs",costPrice,sellingPrice:140,
  stockQuantity:10,minimumStock:1,isActive:true,createdAt:"2026-01-01",updatedAt:"2026-01-01",
});
const supplier=id=>({id,name:"Vendor "+id,openingBalance:0,outstandingBalance:0,
  createdAt:"2026-01-01",updatedAt:"2026-01-01"});
const request=(ref="RFQ-A")=>({reference:ref,requiredBy:"2026-12-31",
  supplierIds:["s1","s2"],lines:[{productId:"p1",quantity:"2.125"},{productId:"p2",quantity:"1"}],
  notes:"B2B bulk order"});
const bid=(supplierId,unitCost="90.00")=>({
  supplierId,quoteReference:"Q-"+supplierId,validUntil:"2026-12-30",
  lines:[{productId:"p1",unitCost,taxRate:"18"},{productId:"p2",unitCost:"70.00",taxRate:"5"}]
});
const chart=accounting.exportAccountingState().accounts;
function reset(){
  permissions.setCurrentRole("admin");permissions.setRuntimeFeaturePolicy(null);
  branches.hydratePhase9({branches:[{
    id:"branch-hq",name:"Main",code:"HQ",isHeadquarters:true,isActive:true,
    createdAt:"2026-01-01",updatedAt:"2026-01-01"
  }],activeBranchId:"branch-hq"});
  store.hydrateCore({products:[product("p1"),product("p2")],customers:[],sales:[],payments:[]});
  phase5.hydratePhase5({suppliers:[supplier("s1"),supplier("s2")],laundryOrders:[],expenses:[],purchases:[]});
  procurement.hydrateProcurementState({purchaseOrders:[],goodsReceipts:[],purchaseInvoices:[]});
  rfq.hydrateProcurementRfqState({records:[]});
  accounting.hydrateAccountingState({accounts:chart,journals:[],journalSequence:0});
  outbox.hydrateOutbox([]);
}
function state(){
  return JSON.stringify({rfqs:rfq.exportProcurementRfqState(),
    po:procurement.listPurchaseOrders(),products:store.listProducts(),accounting:accounting.listJournalEntries()});
}
test("RFQ: saved multi-supplier request -> issue -> capture prices -> compare -> exact one draft PO",()=>{
  reset();
  const created=rfq.createProcurementRfq(request());
  assert.equal(created.status,"draft");
  assert.equal(created.supplierIds.length,2);
  assert.equal(created.lines[0].quantity,2.125);
  assert.equal(rfq.listProcurementRfqs().length,1);
  assert.throws(()=>rfq.createProcurementRfq(request()),/reference already exists/i);
  const issued=rfq.issueProcurementRfq(created.id,created.version);
  assert.equal(issued.status,"issued");
  const first=rfq.recordProcurementRfqQuote(issued.id,issued.version,bid("s1","90.00"));
  const second=rfq.recordProcurementRfqQuote(first.id,first.version,bid("s2","82.00"));
  const ordered=rfq.compareProcurementRfqQuotes(second.id);
  assert.equal(ordered[0].supplierId,"s2");
  assert(ordered[0].total<ordered[1].total);
  const stockBefore=store.listProducts().map(p=>p.stockQuantity);
  const awarded=rfq.awardProcurementRfq(second.id,second.version,"s2");
  assert.equal(awarded.rfq.status,"awarded");
  assert.equal(awarded.purchaseOrder.status,"draft");
  assert.equal(awarded.purchaseOrder.supplierId,"s2");
  assert.deepEqual(awarded.purchaseOrder.lines.map(l=>[l.productId,l.orderedQuantity,l.unitCost]),
    [["p1",2.125,82],["p2",1,70]]);
  assert.equal(awarded.purchaseOrder.expectedDeliveryDate,"2026-12-31");
  assert.equal(procurement.listPurchaseOrders().length,1);
  assert.deepEqual(store.listProducts().map(p=>p.stockQuantity),stockBefore);
  assert.equal(accounting.listJournalEntries().length,0);
  assert.equal(phase5.getSupplier("s2").outstandingBalance,0);
  // Double-click/replay must not create a second purchase order.
  const replay=rfq.awardProcurementRfq(second.id,second.version,"s2");
  assert.equal(replay.purchaseOrder.id,awarded.purchaseOrder.id);
  assert.equal(procurement.listPurchaseOrders().length,1);
  assert.throws(()=>rfq.awardProcurementRfq(second.id,second.version,"s1"));
  assert.throws(()=>rfq.cancelProcurementRfq(second.id,awarded.rfq.version),/cannot cancel/i);
});
test("RFQ quote failures are atomic, reject incomplete cross-vendor bids and stale versions",()=>{
  reset();
  const created=rfq.createProcurementRfq(request("RFQ-B"));
  const issued=rfq.issueProcurementRfq(created.id,created.version);
  const before=state();
  const bad=[bid("wrong"),bid("s1","1e6"),bid("s1","100.001"),
    {...bid("s1"),lines:[{productId:"p1",unitCost:"100",taxRate:"18"}]},
    {...bid("s1"),lines:[{productId:"p1",unitCost:"100",taxRate:"18"},{productId:"p1",unitCost:"90",taxRate:"5"}]},
    {...bid("s1"),lines:[{productId:"p1",unitCost:"90",taxRate:"101"},{productId:"p2",unitCost:"90",taxRate:"0"}]},
  ];
  for(const attempt of bad) {
    assert.throws(()=>rfq.recordProcurementRfqQuote(issued.id,issued.version,attempt));
    assert.equal(state(),before);
  }
  assert.throws(()=>rfq.recordProcurementRfqQuote(issued.id,issued.version-1,bid("s1")),/changed/);
  assert.throws(()=>rfq.awardProcurementRfq(issued.id,issued.version,"s1"),/not submitted/i);
  const quoted=rfq.recordProcurementRfqQuote(issued.id,issued.version,
    {...bid("s1"),validUntil:"2026-01-01"});
  assert.throws(()=>rfq.awardProcurementRfq(quoted.id,quoted.version,"s1"),/expired/i);
  assert.equal(procurement.listPurchaseOrders().length,0);
});
test("RFQ backup/restore preserves vendor rates and linked PO with legacy empty snapshot compatibility",()=>{
  reset();
  const first=rfq.createProcurementRfq(request("RFQ-C"));
  const issued=rfq.issueProcurementRfq(first.id,first.version);
  const saved=rfq.recordProcurementRfqQuote(issued.id,issued.version,bid("s2"));
  const awarded=rfq.awardProcurementRfq(saved.id,saved.version,"s2");
  const before=JSON.stringify(rfq.exportProcurementRfqState());
  const restored=rfq.validateProcurementRfqState(JSON.parse(before));
  assert.equal(JSON.stringify(restored),before);
  rfq.hydrateProcurementRfqState(restored);
  assert.equal(rfq.getProcurementRfq(awarded.rfq.id).purchaseOrderId,awarded.purchaseOrder.id);
  rfq.hydrateProcurementRfqState(undefined);
  assert.equal(rfq.listProcurementRfqs().length,0);
  assert.throws(()=>rfq.validateProcurementRfqState({records:[{...awarded.rfq,quotes:[{...awarded.rfq.quotes[0],supplierId:"foreign"}]}]}));
});
test("shared Web/Windows procurement UI exposes saved quote/PO workflow and backup",()=>{
  const host=fs.readFileSync("packages/ui/src/components/purchases/ProcurementPanel.tsx","utf8");
  const ui=fs.readFileSync("packages/ui/src/components/purchases/RfqWorkflowPanel.tsx","utf8");
  const draft=fs.readFileSync("packages/ui/src/components/purchases/RfqDraftPanel.tsx","utf8");
  const persist=fs.readFileSync("packages/business-logic/src/persistence.ts","utf8");
  const desktop=fs.readFileSync("apps/desktop/src/components/DesktopProcurementPanel.tsx","utf8");
  const web=fs.readFileSync("apps/web/src/app/(app)/purchases/page.tsx","utf8");
  assert(host.includes("<RfqDraftPanel"));
  assert(draft.includes("<RfqWorkflowPanel"));
  assert(ui.includes("awardProcurementRfq"));
  assert(draft.includes("createProcurementRfq("));
  assert(desktop.includes("onRfqChanged={refresh}"));
  assert(web.includes("onRfqChanged={refresh}"));
  assert(persist.includes("procurementRfqs: procurementRfqs.exportProcurementRfqState()"));
  assert(persist.includes("procurementRfqs: procurementRfqs.validateProcurementRfqState(input.procurementRfqs)"));
});
