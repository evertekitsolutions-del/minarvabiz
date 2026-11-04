import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText,
  filename
);

const store = require("../store.ts");
const family = require("../product-variant-family.ts");
const planner = require("../product-variant-planner.ts");
const labels = require("../barcode-labels.ts");
const checkout = require("../sale-checkout-guard.ts");
const accounting = require("../accounting-store.ts");
const permissions = require("../permissions.ts");
const outbox = require("../outbox-bridge.ts");

permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);
const accounts = accounting.exportAccountingState().accounts;
function reset() {
  accounting.hydrateAccountingState({ accounts, journals: [], journalSequence: 0 });
  store.hydrateCore({ customers: [], products: [], sales: [], payments: [] });
  outbox.hydrateOutbox([]);
}
function base(patch={}) {
  return {
    name: "Boutique Dress", sku: "DRESS", barcode: null, categoryId: null,
    brand: "Boutique", size: null, color: null, fabric: null,
    parentProductId: null, hasVariants: false, unit: "pcs",
    costPrice: 100, sellingPrice: 300, discount: 0, taxRate: 0,
    stockQuantity: 0, minimumStock: 1, supplierId: null, imageUrl: null,
    notes: null, isActive: true, branchId: null,
    ...patch,
  };
}
const row=(size,color,material,quantity,sku="",barcode="") => ({
  size,color,material,quantity:String(quantity),sku,barcode,
});
const sample=[row("S","Red","Cotton",2),row("M","Red","Cotton",3),row("L","Blue","Linen",5)];

reset();
const original = family.createProductVariantFamily(base(),sample);
assert.equal(original.parent.hasVariants,true);
assert.equal(original.parent.stockQuantity,0);
assert.equal(original.parent.barcode,null);
assert.equal(original.variants.length,3);
assert.equal(original.variants.reduce((total,item)=>total+item.stockQuantity,0),10);
assert.deepEqual(original.variants.map(item=>item.stockQuantity),[2,3,5]);
assert.deepEqual(original.variants.map(item=>[item.size,item.color,item.fabric]),[
  ["S","Red","Cotton"],["M","Red","Cotton"],["L","Blue","Linen"]]);
assert.equal(new Set(original.variants.map(item=>item.barcode)).size,3);
assert.ok(original.variants.every(item=>item.parentProductId===original.parent.id && !item.hasVariants));
assert.ok(original.variants.every(item=>item.sku?.startsWith("DRESS-")));
assert.ok(original.variants.every(item=>store.getProductByBarcode(item.barcode)?.id===item.id));
assert.equal(accounting.listJournalEntries().filter(entry=>entry.referenceType==="auto_opening_stock").length,3);
const inventoryAsset=accounting.getSystemAccount("inventory_asset");
const trialBalance=accounting.buildTrialBalance().find(entry=>entry.accountId===inventoryAsset.id);
assert.equal(trialBalance.debit-trialBalance.credit,1000);
assert.ok(accounting.buildBalanceSheet().balanced);
assert.equal(outbox.listPendingOutbox().filter(event=>event.aggregateType==="products").length,4);

// The parent never sells, even if an attacker supplies a forged stale cart.
const forged={
  productId: original.parent.id, productName: original.parent.name, quantity: 1,
  unitPrice: 300,costPrice:100,stockQuantity:999,discountPercent:0,taxRate:0,
};
const guard = (line) => checkout.validateLiveSaleCheckout([line],{paidAmount:0,allowNegativeStock:true},
  id=>store.getProduct(id),id=>store.getCustomer(id));
assert.match(guard(forged).join(";"),/choose a specific size/);
const sellable={...forged,productId:original.variants[0].id,productName:original.variants[0].name};
assert.equal(guard(sellable).length,0);

// Price and each fabric attribute must be printed per variant, even in compact layout.
const html=labels.buildBarcodeLabelHtml(original.variants[1],{copies:3,autoPrint:false,labelWidthMm:50,labelHeightMm:30});
assert.match(html,/Size: M/);assert.match(html,/Colour: Red/);assert.match(html,/Material: Cotton/);
assert.match(html,/class="price">/);
assert.equal((html.match(/class="label compact/g)||[]).length,3);
assert.doesNotMatch(html,/window\.print\(\)/);

// Subsequent stock intake adds a new distinct combination with no parent duplication.
const extra=family.addProductVariants(original.parent.id,[row("XL","Green","Silk",0,"DRESS-XL","CUSTOM-XL")]);
assert.equal(extra.length,1);
assert.equal(extra[0].stockQuantity,0);
assert.equal(extra[0].sku,"DRESS-XL");
assert.equal(extra[0].barcode,"CUSTOM-XL");
assert.equal(store.listProducts().length,5);
assert.equal(accounting.listJournalEntries().filter(entry=>entry.referenceType==="auto_opening_stock").length,3);

assert.throws(()=>store.adjustStock(original.parent.id,"stock_in",1),/specific size|variant/i);
assert.throws(()=>store.adjustStockToQuantity(original.parent.id,"3",0),/variant/i);
assert.match(store.archiveProduct(original.parent.id,"Do not archive active group").error,/variant/i);

// All product/child relationships roundtrip in the existing SQLite core snapshot.
const snapshot=store.exportCoreState();
store.hydrateCore(snapshot);
assert.equal(store.listProducts().length,5);
assert.equal(store.listProducts().filter(item=>item.parentProductId===original.parent.id).length,4);
assert.equal(store.getProductByBarcode(original.variants[2].barcode).fabric,"Linen");

// Exact per-size count, duplicate combination, invalid quantities, and external identifiers.
assert.equal(planner.parseProductVariants(sample).reduce((sum,item)=>sum+item.quantity,0),10);
assert.equal(planner.variantIdentity({size:" M ",color:" red ",material:"COTTON"}),
  planner.variantIdentity({size:"m",color:"Red",material:"cotton"}));
for(const invalid of ["-1","1.5","","NaN","Infinity","1e2","001"]) {
  assert.throws(()=>planner.parseProductVariants([row("S","Red","Cotton",invalid)]),/whole number/);
}
assert.throws(()=>planner.parseProductVariants([]),/at least one/);
assert.throws(()=>planner.parseProductVariants(Array.from({length:101},(_,i)=>row("S"+i,"Red","Cotton",1))),/Maximum 100/);
assert.throws(()=>planner.parseProductVariants([row("","","",1)]),/enter size/);
assert.throws(()=>planner.parseProductVariants([row("M","Red","Cotton",1),row("m"," red ","COTTON",1)]),/duplicate/);
assert.throws(()=>planner.parseProductVariants([row("M","Red","Cotton",1,"SAME","same")]),/duplicated/);
assert.throws(()=>planner.parseProductVariants([row("S","Red","Cotton",1)],
  [{size:"s",color:"RED",material:"cotton",sku:null,barcode:null}]),/duplicate/);

// Validation is non-mutating: invalid family/variant calls must preserve stock.
const count=store.listProducts().length;
assert.throws(()=>family.addProductVariants("no-such-product",sample),/variant-group/);
assert.throws(()=>family.addProductVariants(original.variants[0].id,sample),/variant-group/);
assert.throws(()=>family.addProductVariants(original.parent.id,[row("M","Red","Cotton",2)]),/duplicate/);
assert.throws(()=>family.addProductVariants(original.parent.id,[row("XL","Blue","Silk",1,"DRESS-01")]),/Duplicate variant SKU/);
assert.throws(()=>family.addProductVariants(original.parent.id,[row("XL","Blue","Silk",1,"NEW",original.variants[0].barcode)]),/Duplicate variant barcode/);
assert.equal(store.listProducts().length,count);
assert.throws(()=>family.createProductVariantFamily(base({stockQuantity:1}),sample),/parent opening stock/);
assert.throws(()=>family.createProductVariantFamily(base({parentProductId:"someone"}),sample),/cannot have another parent/);
assert.throws(()=>family.createProductVariantFamily(base(),sample),/Parent SKU already exists/);
assert.throws(()=>family.createProductVariantFamily(base({sku:"NEW-DRESS"}),[row("S","Red","Cotton",2,"DRESS-02")]),/SKU or barcode already exists/);
assert.equal(store.listProducts().length,count);

// Existing nonvariant catalog and role permission behavior remain unchanged.
const single=store.createProduct(base({name:"Legacy Item",sku:"OLD",stockQuantity:4}));
assert.equal(single.stockQuantity,4);
assert.equal(single.parentProductId,null);
permissions.setCurrentRole("cashier");
assert.throws(()=>family.addProductVariants(original.parent.id,[row("XXL","Black","Cotton",1)]),/denied/i);
assert.throws(()=>family.createProductVariantFamily(base({sku:"RESTRICTED"}),sample),/denied/i);
permissions.setCurrentRole("admin");
console.log("Boutique product variants: per-size stock, EAN barcode, labels, accounting, offline restore, security PASS");
