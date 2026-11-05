import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,p);
const permissions=require("../permissions.ts");
const core=require("../store.ts");
const families=require("../product-variant-family.ts");
const variants=require("../product-variant-planner.ts");
const purchases=require("../phase5-store.ts");
const accounting=require("../accounting-store.ts");
const outbox=require("../outbox-bridge.ts");
const labels=require("../barcode-labels.ts");
const checkout=require("../sale-checkout-guard.ts");
const initialAccounts=accounting.exportAccountingState().accounts;
function reset(){
  permissions.setCurrentRole("admin");permissions.setRuntimeFeaturePolicy(null);
  accounting.hydrateAccountingState({accounts:initialAccounts,journals:[],journalSequence:0});
  core.hydrateCore({customers:[],products:[],sales:[],payments:[]});
  purchases.hydratePhase5({suppliers:[],laundryOrders:[],expenses:[],purchases:[]});
  outbox.hydrateOutbox([]);
}
function base(){return {
  name:"Designer Kurti",sku:"KURTI",barcode:null,categoryId:null,brand:"Generic",size:null,color:null,
  fabric:null,parentProductId:null,hasVariants:false,unit:"pcs",costPrice:0,
  sellingPrice:649,mrp:999,specialOfferPrice:649,
  discount:0,taxRate:0,stockQuantity:0,minimumStock:0,supplierId:null,
  imageUrl:null,notes:null,isActive:true,branchId:null
};}
function row(brand,size,color,material,quantity){return {brand,size,color,material,quantity:String(quantity),sku:"",barcode:""};}
test("same garment with equal size/color/fabric but different brands has separate stock and barcodes",()=>{
  reset();
  const {parent,variants:children}=families.createProductVariantFamily(base(),[
    row("Brand A","M","Red","Cotton",0),
    row("Brand B","M","Red","Cotton",0),
    row("Brand A","XL","Blue","Silk",0),
  ]);
  assert.equal(parent.stockQuantity,0);
  assert.equal(children.length,3);
  assert.deepEqual(children.map(x=>[x.brand,x.fabric,x.size,x.color,x.stockQuantity]),[
    ["Brand A","Cotton","M","Red",0],["Brand B","Cotton","M","Red",0],["Brand A","Silk","XL","Blue",0]
  ]);
  assert.equal(new Set(children.map(x=>x.id)).size,3);
  assert.equal(new Set(children.map(x=>x.barcode)).size,3);
  const label=labels.buildBarcodeLabelHtml(children[0],{copies:1,autoPrint:false,labelWidthMm:50,labelHeightMm:30});
  assert.match(label,/MRP /);assert.match(label,/Offer /);assert.match(label,/999\.00/);assert.match(label,/649\.00/);
  const supplier={id:"supplier-a",name:"Kurti supplier",openingBalance:0,outstandingBalance:0,createdAt:"2026-11-05",updatedAt:"2026-11-05"};
  purchases.hydratePhase5({suppliers:[supplier],laundryOrders:[],expenses:[],purchases:[]});
  const stockLines=[
    {productId:children[0].id,quantity:5,unitCost:230},
    {productId:children[1].id,quantity:8,unitCost:210},
    {productId:children[2].id,quantity:3,unitCost:400},
  ];
  const received=purchases.createPurchase({
    supplierId:supplier.id,description:"SUPPLIER-INV-121",amount:4030,
    paidAmount:1030,paymentMethod:"upi",kind:"general",stockLines,
  });
  assert.equal(received.errors.length,0,received.errors.join("; "));
  assert(received.purchase);
  assert.equal(received.purchase.stockLines.length,3);
  assert.deepEqual(children.map(c=>core.getProduct(c.id).stockQuantity),[5,8,3]);
  assert.equal(children.reduce((sum,p)=>sum+core.getProduct(p.id).stockQuantity,0),16);
  assert.equal(core.getProduct(parent.id).stockQuantity,0);
  assert.equal(purchases.getSupplier(supplier.id).outstandingBalance,3000);
  const journal=accounting.listJournalEntries().find(j=>j.referenceType==="auto_direct_purchase"&&j.referenceId===received.purchase.id);
  assert(journal&&journal.status==="posted");
  const asset=accounting.getSystemAccount("inventory_asset").id;
  const other=accounting.getSystemAccount("unclassified_purchases").id;
  assert.equal(journal.lines.filter(l=>l.accountId===asset).reduce((s,l)=>s+l.debit,0),4030);
  assert.equal(journal.lines.filter(l=>l.accountId===other).reduce((s,l)=>s+l.debit,0),0);
  assert(accounting.buildBalanceSheet().balanced);
  const snapshot=JSON.parse(JSON.stringify({core:core.exportCoreState(),purchase:purchases.exportPhase5State()}));
  core.hydrateCore(snapshot.core);purchases.hydratePhase5(snapshot.purchase);
  assert.equal(purchases.listPurchases()[0].stockLines[2].productId,children[2].id);
  assert.equal(core.getProduct(children[1].id).stockQuantity,8);
  const sales=checkout.validateLiveSaleCheckout([{productId:children[0].id,productName:children[0].name,quantity:1,
    unitPrice:649,costPrice:230,stockQuantity:5,discountPercent:0,taxRate:0}],{paidAmount:0},id=>core.getProduct(id),()=>undefined);
  assert.equal(sales.length,0,sales.join("; "));
});
test("incorrect invoice amount, forged parent SKU and malformed stock lines do not post or mutate stock",()=>{
  reset();
  const family=families.createProductVariantFamily(base(),[row("Brand A","L","Black","Linen",2)]);
  const actual=family.variants[0];
  for(const lines of [
    [{productId:family.parent.id,quantity:1,unitCost:100}],
    [{productId:actual.id,quantity:-1,unitCost:100}],
    [{productId:actual.id,quantity:NaN,unitCost:100}],
    [{productId:actual.id,quantity:1,unitCost:Infinity}],
    [{productId:actual.id,quantity:1,unitCost:100}],
  ]){
    const before=JSON.stringify({stock:core.getProduct(actual.id).stockQuantity,journals:accounting.listJournalEntries().length,number:purchases.listPurchases().length});
    const output=purchases.createPurchase({description:"Invalid invoice",amount:500,paidAmount:500,paymentMethod:"cash",kind:"general",stockLines:lines});
    assert.equal(output.purchase,null);
    assert(output.errors.length>0);
    assert.equal(JSON.stringify({stock:core.getProduct(actual.id).stockQuantity,journals:accounting.listJournalEntries().length,number:purchases.listPurchases().length}),before);
  }
  assert.throws(()=>variants.parseProductVariants([row("Brand A","M","Red","Cotton",1),row("brand a","m","RED","cotton",1)]),/duplicate/i);
});
