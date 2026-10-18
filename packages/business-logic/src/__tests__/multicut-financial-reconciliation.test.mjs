import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(
  ts.transpileModule(fs.readFileSync(file,"utf8"),{
    fileName:file,compilerOptions:{
      module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
      esModuleInterop:true,inlineSourceMap:true,inlineSources:true,
    },
  }).outputText,file
);
const {previewDimensionRow}=require("../dimensional-billing.ts");
const {attachNormalAreaMeasurement,appendNormalBillingLine}=require("../normal-area-billing.ts");
const {appendPosMeasuredCut}=require("../pos-area-cart.ts");
const store=require("../store.ts");
const accounting=require("../accounting-store.ts");
const outbox=require("../outbox-bridge.ts");
const permissions=require("../permissions.ts");
const remote=require("../remote-write.ts");
const {exportDomainSnapshotFull,validateDomainSnapshot}=require("../persistence.ts");

permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
remote.registerRemoteWriter(null);
const systemAccounts=accounting.exportAccountingState().accounts;
const baseProduct=()=>({
  id:"area-material",name:"Area Material",unit:"sqft",
  isActive:true,stockQuantity:5,sellingPrice:100,costPrice:40,
  discount:0,taxRate:0,version:1,
});
const draft=(width,pieces="1")=>{
  const p=previewDimensionRow({
    length:"12",width,lengthUnit:"in",widthUnit:"in",
    billableUnit:"sqft",pieces,
  });
  assert.equal(p.valid,true);
  return p.measurement;
};
const a=draft("18","2"); // 3 sqft
const b=draft("12"); // 1 sqft
const row=(quantity=1)=>({
  productId:"area-material",productName:"Area Material",
  quantity,unitPrice:100,costPrice:40,stockQuantity:5,
  discountPercent:0,taxRate:0,
});
const normalCuts=()=>appendNormalBillingLine(
  appendNormalBillingLine([],
    {...attachNormalAreaMeasurement(row(),baseProduct(),a),cartLineId:"normal-a"}),
  {...attachNormalAreaMeasurement({...row(),unitPrice:200},baseProduct(),b),
    cartLineId:"normal-b"},
);
const posCuts=()=>appendPosMeasuredCut(
  appendPosMeasuredCut([],baseProduct(),a,"pos-a"),baseProduct(),b,"pos-b"
).map((line,i)=>({...line,unitPrice:i?200:100}));

function reset(){
  accounting.hydrateAccountingState({
    accounts:structuredClone(systemAccounts),journals:[],journalSequence:0,
  });
  store.hydrateCore({
    products:[baseProduct()],
    customers:[{id:"buyer",name:"Customer",totalSpending:0,outstandingBalance:0}],
    sales:[],payments:[],
  });
  outbox.hydrateOutbox([]);
}
const fingerprint=()=>JSON.stringify({
  products:store.listProducts(),sales:store.listSales(),
  payments:store.listPayments(),customers:store.listCustomers(),
  journals:accounting.listJournalEntries(),outbox:outbox.exportOutbox(),
});
for(const [mode,makeCuts] of [
  ["normal",normalCuts],
  ["pos",posCuts],
]){
  test(mode+" checkout posts two measured cuts, one stock debit and exactly balanced receipts",()=>{
    reset();
    const cuts=makeCuts();
    assert.deepEqual(cuts.map(x=>x.quantity),[3,1]);
    const result=store.createSale({
      customerId:"buyer",lines:cuts,paidAmount:500,paymentMethod:"card",
      paymentSplits:[
        {method:"card",amount:350},
        {method:"cash",amount:150},
      ],
    });
    assert.deepEqual(result.errors,[]);
    assert.equal(result.sale.items.length,2);
    assert.deepEqual(result.sale.items.map(x=>x.productId),["area-material","area-material"]);
    assert.deepEqual(result.sale.items.map(x=>x.dimensionMetadata.quantityMilli),[3000,1000]);
    assert.notEqual(result.sale.items[0].id,result.sale.items[1].id);
    assert.deepEqual(result.sale.items.map(x=>x.lineTotal),[300,200]);
    assert.equal(result.sale.total,500);
    assert.equal(result.sale.paidAmount,500);
    assert.equal(result.sale.balanceAmount,0);
    assert.equal(store.getProduct("area-material").stockQuantity,1);
    assert.equal(store.listSales().length,1);
    assert.equal(result.payments.length,2);
    assert.deepEqual(result.payments.map(x=>x.amount),[350,150]);
    assert.equal(result.payments.reduce((sum,p)=>sum+p.amount,0),result.sale.total);
    assert.ok(result.payments.every(p=>p.referenceId===result.sale.id));
    const journals=accounting.listJournalEntries();
    assert.equal(journals.length,1);
    assert.equal(journals[0].totalDebit,journals[0].totalCredit);
    assert.equal(accounting.buildBalanceSheet().balanced,true);
    const backup=exportDomainSnapshotFull();
    assert.equal(validateDomainSnapshot(backup).ok,true);
    assert.deepEqual(
      backup.sales.find(s=>s.id===result.sale.id).items.map(x=>x.dimensionMetadata.quantityMilli),
      [3000,1000],
    );
    // No cloud authority configured: a local sale must not be falsely
    // marked remotely acknowledged just because the register succeeded.
    assert.ok(outbox.exportOutbox().every(event=>event.status!=="synced"));
  });
}
test("edited measurements and cumulative overstock fail before altering stock, sale, payment or journal",()=>{
  reset();
  const baseline=fingerprint();
  const cuts=normalCuts();
  const badSets=[
    [...cuts,{...cuts[0],cartLineId:"another",quantity:3}],
    [{...cuts[0],dimensionMetadata:{...cuts[0].dimensionMetadata,length:"13"}},cuts[1]],
    [{...cuts[0],quantity:3.001},cuts[1]],
  ];
  for(const lines of badSets){
    const operation=()=>{
      const result=store.createSale({
        customerId:"buyer",lines,paidAmount:0,paymentMethod:"cash",
      });
      assert.ok(result.errors.length,"Invalid dimensional sale must not return success");
    };
    try{operation();}catch(error){
      // Fail-closed rejection is acceptable if the domain preflight throws.
      assert.match(String(error),/stock|quantity|dimension|audit|area/i);
    }
    assert.equal(fingerprint(),baseline,"Failed checkout must be entirely non-mutating");
  }
});
console.log("UBP-05p cross-mode dimensional stock / payment / ledger reconciliation suite loaded");
