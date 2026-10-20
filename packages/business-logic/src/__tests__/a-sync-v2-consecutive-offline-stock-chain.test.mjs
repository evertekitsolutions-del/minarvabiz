import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,file);
const { buildSaleFinancialEnvelope }=require("../financial-sync-envelope.ts");
const { fixture,IDS,scope }=await import("./financial-sync-envelope.test.mjs");

const ids={
 sale:"10000000-0000-4000-8000-000000000060",
 payment:"10000000-0000-4000-8000-000000000061",
 saleEvent:"10000000-0000-4000-8000-000000000062",
 paymentEvent:"10000000-0000-4000-8000-000000000063",
 journal:"10000000-0000-4000-8000-000000000064",
 debit:"10000000-0000-4000-8000-000000000065",
 credit:"10000000-0000-4000-8000-000000000066",
 item:"10000000-0000-4000-8000-000000000067",
 unrelated:"10000000-0000-4000-8000-000000000068",
 foreignProduct:"10000000-0000-4000-8000-000000000069",
};
function consecutive() {
  const s=fixture(),original=s.sales[0],old=s.outbox[0];
  const sale=structuredClone(original);
  Object.assign(sale,{id:ids.sale,invoiceNumber:"INV-S2",subtotal:100,total:100,
    paidAmount:100,balanceAmount:0,createdAt:original.createdAt,updatedAt:original.updatedAt});
  sale.items=[{...original.items[0],id:ids.item,saleId:ids.sale,quantity:1,lineTotal:100}];
  const payment={...s.payments[0],id:ids.payment,amount:100,referenceId:ids.sale};
  const journal={...structuredClone(s.accounting.journals[0]),id:ids.journal,
    referenceId:ids.sale,journalNumber:"JV-S2",totalDebit:100,totalCredit:100,
    lines:[
      {...s.accounting.journals[0].lines[0],id:ids.debit,journalEntryId:ids.journal,debit:100},
      {...s.accounting.journals[0].lines[2],id:ids.credit,journalEntryId:ids.journal,credit:100},
    ]};
  const saleEvent={...structuredClone(old),id:ids.saleEvent,aggregateId:ids.sale,
    payload:structuredClone(sale),sequence:17,financialSyncProof:{
      ...structuredClone(old.financialSyncProof),journalId:ids.journal,
      paymentEventIds:[ids.paymentEvent],expectedVersions:{[IDS.product]:9},
      stockLines:[{
        ...structuredClone(old.financialSyncProof.stockLines[0]),quantity:1,
        expectedProductVersion:9,priorProductStock:6.25,resultingProductStock:5.25,
        expectedWarehouseVersion:5,priorOnHand:3.75,resultingOnHand:2.75,
      }]
    }};
  const paymentEvent={...structuredClone(s.outbox[1]),id:ids.paymentEvent,
    aggregateId:ids.payment,payload:structuredClone(payment),sequence:18};
  s.sales.push(sale);s.payments.push(payment);s.accounting.journals.push(journal);
  s.outbox.push(saleEvent,paymentEvent);
  s.products[0].version=10;s.products[0].stockQuantity=5.25;
  s.warehouse.stock[0].version=6;s.warehouse.stock[0].onHand=2.75;
  return s;
}
const project=(s,id=IDS.saleEvent)=>buildSaleFinancialEnvelope(s,id,scope);
const ackFirst=s=>{for(const ev of s.outbox.slice(0,3))ev.status="synced";};

test("two offline same-SKU sales retain first exact stock proof despite newer local snapshot",()=>{
  const s=consecutive(),before=structuredClone(s);
  const first=project(s);
  assert.equal(first.operation,"sale.post",JSON.stringify(first));
  assert.equal(first.expectedVersions[IDS.product],8,
    "Cloud must receive original server expected version, not terminal local version");
  assert.equal(first.stockLines[0].resultingProductStock,6.25);
  assert.deepEqual(s,before,"No receipt/stock edits during read-only proof projection");
});
test("the second sale cannot leapfrog a still-pending first sale or any payment",()=>{
  const s=consecutive();
  assert.equal(project(s,ids.saleEvent).held,"prior_stock_sale_receipt_pending");
  s.outbox[0].status="synced";
  assert.equal(project(s,ids.saleEvent).held,"prior_stock_sale_receipt_pending",
    "A sale-only acknowledgement does not authorize bypassing unsettled payments");
  ackFirst(s);
  const later=project(s,ids.saleEvent);
  assert.equal(later.operation,"sale.post",JSON.stringify(later));
  assert.equal(later.expectedVersions[IDS.product],9);
  assert.equal(later.stockLines[0].expectedWarehouseVersion,5);
});
test("an invalid successor stock version, location or quantity cannot explain current stock",()=>{
  for(const field of ["expectedProductVersion","expectedWarehouseVersion","locationId","quantity"]) {
    const s=consecutive();
    const row=s.outbox[3].financialSyncProof.stockLines[0];
    if(field==="locationId")row.locationId=ids.unrelated;
    else row[field]+=1;
    assert.equal(project(s).held,"stock_successor_chain_conflict",field);
  }
});
test("a broken or missing successor sale snapshot is held rather than silently accepted",()=>{
  for(const mutate of [
    s=>s.sales.pop(),
    s=>{s.outbox[3].payload.items[0].quantity=2;},
    s=>{delete s.outbox[3].financialSyncProof;},
    s=>{s.outbox[3].status="discarded";},
  ]) {
    const s=consecutive();mutate(s);
    assert.equal(project(s).held,"stock_successor_chain_conflict");
  }
});
test("an unrelated product sale does not block a clean earlier stock envelope",()=>{
  const s=fixture();
  s.outbox.push({...structuredClone(s.outbox[0]),id:ids.unrelated,aggregateId:ids.unrelated,
    payload:{id:ids.unrelated,items:[{productId:ids.foreignProduct,quantity:1}]},
    financialSyncProof:undefined,sequence:17});
  assert.equal(project(s).operation,"sale.post");
});
test("unexpected independent local stock revision still holds the older envelope",()=>{
  const s=consecutive();s.products[0].version++;
  assert.equal(project(s).held,"stock_snapshot_revision_conflict");
});
