import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url), ts=require("typescript");
require.extensions[".ts"]=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,p);
const account=require("../accounting-store.ts");
const store=require("../store.ts");
const supplierStore=require("../phase5-store.ts");
const family=require("../product-variant-family.ts");
const planner=require("../product-variant-planner.ts");
const procurement=require("../procurement-store.ts");
const purchase=require("../boutique-stock-purchase.ts");
const labels=require("../barcode-labels.ts");
const permissions=require("../permissions.ts");
const branch=require("../phase9-store.ts");
const checkout=require("../sale-checkout-guard.ts");
const chart=account.exportAccountingState().accounts;
function reset(){
 permissions.setCurrentRole("admin");permissions.setRuntimeFeaturePolicy(null);
 branch.hydratePhase9({branches:[{id:"hq",name:"Boutique HQ",code:"HQ",isHeadquarters:true,isActive:true,createdAt:"2026-01-01",updatedAt:"2026-01-01"}],activeBranchId:"hq"});
 account.hydrateAccountingState({accounts:chart,journals:[],journalSequence:0});
 store.hydrateCore({products:[],customers:[],sales:[],payments:[]});
 supplierStore.hydratePhase5({suppliers:[],laundryOrders:[],expenses:[],purchases:[]});
 procurement.hydrateProcurementState({purchaseOrders:[],goodsReceipts:[],purchaseInvoices:[]});
}
const draft=(brand,size,color,material,quantity)=>({
 brand,size,color,material,quantity:String(quantity),sku:"",barcode:""
});
test("four-dimensional brand/size/colour/fabric stock, accurate MRP + offer labels, and persisted variants",()=>{
 reset();
 const all=family.createProductVariantFamily({
  name:"Dress",sku:"DRESS",barcode:null,brand:"Brand A",fabric:null,size:null,color:null,
  unit:"pcs",costPrice:120,mrp:499,sellingPrice:349,discount:0,taxRate:0,stockQuantity:0,
  minimumStock:1,hasVariants:true,isActive:true
 },[
   draft("Brand A","M","Red","Cotton",2),
   draft("Brand B","M","Red","Cotton",3),
   draft("Brand B","40","Red","Silk",5),
 ]);
 assert.equal(all.variants.length,3);
 assert.deepEqual(all.variants.map(p=>p.brand),["Brand A","Brand B","Brand B"]);
 assert.deepEqual(all.variants.map(p=>p.stockQuantity),[2,3,5]);
 assert.equal(all.variants.reduce((s,p)=>s+p.stockQuantity,0),10);
 assert.equal(new Set(all.variants.map(p=>p.barcode)).size,3);
 assert.throws(()=>planner.parseProductVariants([draft("B","M","Red","Cotton",1),draft("b","m","red","cotton",2)]),/duplicate/i);
 const html=labels.buildBarcodeLabelHtml(all.variants[0],{copies:1,autoPrint:false,labelWidthMm:38,labelHeightMm:38});
 assert.match(html,/MRP:\s*(?:INR|₹)\s*499\.00/);
 assert.match(html,/Offer:\s*(?:INR|₹)\s*349\.00/);
 const persisted=JSON.parse(JSON.stringify(store.exportCoreState()));
 store.hydrateCore(persisted);
 assert.equal(store.getProduct(all.variants[0].id).mrp,499);
 assert.equal(store.getProduct(all.variants[0].id).sellingPrice,349);
 const sellable=store.getProduct(all.variants[0].id);
 assert.deepEqual(checkout.validateLiveSaleCheckout([{
   productId:sellable.id,productName:sellable.name,quantity:1,unitPrice:349,
   costPrice:120,stockQuantity:2,discountPercent:0,taxRate:0
 }],{paidAmount:0,allowNegativeStock:false},id=>store.getProduct(id),id=>store.getCustomer(id)),[]);
});
test("supplier stock bill receives each variant exactly once and posts supplier payable once",()=>{
 reset();
 const supplier=supplierStore.createSupplier({name:"Fabric House",category:"boutique",openingBalance:0});
 assert.equal(supplier.errors.length,0);
 const product=store.createProduct({
  name:"Dress Red M",sku:"BRAND-DRESS-RM",barcode:"BT-001",brand:"Brand A",fabric:"Cotton",size:"M",color:"Red",
  unit:"pcs",costPrice:100,mrp:399,sellingPrice:299,stockQuantity:1,minimumStock:0,isActive:true
 });
 const other=store.createProduct({
  name:"Dress Red L",sku:"BRAND-DRESS-RL",barcode:"BT-002",brand:"Brand A",fabric:"Cotton",size:"L",color:"Red",
  unit:"pcs",costPrice:110,mrp:429,sellingPrice:329,stockQuantity:2,minimumStock:0,isActive:true
 });
 const input={supplierId:supplier.supplier.id,supplierInvoiceNumber:"SUP-101",invoiceDate:"2026-11-05",
 lines:[{productId:product.id,quantity:3,unitCost:90,taxRate:0},
        {productId:other.id,quantity:4,unitCost:100,taxRate:0}],
 paidAmount:170,paymentMethod:"cash"};
 const posted=purchase.postBoutiqueStockPurchase(input);
 assert.equal(posted.error,undefined,posted.error);
 assert(posted.invoice);
 assert.equal(store.getProduct(product.id).stockQuantity,4);
 assert.equal(store.getProduct(other.id).stockQuantity,6);
 assert.equal(procurement.listPurchaseOrders().length,1);
 assert.equal(procurement.listGoodsReceipts().length,1);
 assert.equal(procurement.listPurchaseInvoices().length,1);
 assert.equal(posted.invoice.total,670);
 assert.equal(posted.invoice.paidAmount,170);
 assert.equal(posted.invoice.balanceAmount,500);
 assert.equal(supplierStore.getSupplier(supplier.supplier.id).outstandingBalance,500);
 assert(account.buildBalanceSheet().balanced);
 const retry=purchase.postBoutiqueStockPurchase(input);
 assert.match(retry.error,/already recorded/i);
 assert.equal(store.getProduct(product.id).stockQuantity,4);
 assert.equal(procurement.listGoodsReceipts().length,1);
});
test("duplicate product, impossible quantities and forged parent variants fail without stock or journals",()=>{
 reset();
 const supplier=supplierStore.createSupplier({name:"Supplier",openingBalance:0});
 const variant=family.createProductVariantFamily({
 name:"Dress",sku:"DRESS",unit:"pcs",costPrice:10,mrp:50,sellingPrice:35,
 stockQuantity:0,minimumStock:0,isActive:true,hasVariants:true
 },[draft("A","S","Black","Cotton",0)]);
 const input={supplierId:supplier.supplier.id,supplierInvoiceNumber:"X-1",invoiceDate:"2026-11-05",
 lines:[{productId:variant.variants[0].id,quantity:1,unitCost:10}]};
 const before=JSON.stringify({stock:store.exportCoreState(),procurement:procurement.exportProcurementState(),accounting:account.exportAccountingState()});
 for(const change of [
  {...input,lines:[...input.lines,...input.lines]},
  {...input,lines:[{...input.lines[0],quantity:1.5}]},
  {...input,lines:[{...input.lines[0],unitCost:-1}]},
  {...input,lines:[{...input.lines[0],productId:variant.parent.id}]},
  {...input,paidAmount:999},
 ])assert(purchase.postBoutiqueStockPurchase(change).error);
 const after=JSON.stringify({stock:store.exportCoreState(),procurement:procurement.exportProcurementState(),accounting:account.exportAccountingState()});
 assert.equal(after,before);
});
