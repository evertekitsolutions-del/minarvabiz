import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const plannerSrc = fs.readFileSync(new URL("../packages/business-logic/src/product-variant-planner.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(plannerSrc, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}, reportDiagnostics: true });
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const module = { exports: {} };
vm.runInThisContext(`(function(module, exports){\n${compiled.outputText}\n})`)(module,module.exports);
const { parseProductVariants, variantIdentity } = module.exports;
const draft = (size,color,material,quantity,sku="",barcode="") => ({size,color,material,quantity,sku,barcode});

const rows = parseProductVariants([
  draft("S", "Red", "Cotton", "2"),
  draft("M", "Red", "Cotton", "3"),
  draft("L", "Blue", "Linen", "5"),
]);
assert.equal(rows.reduce((sum,row)=>sum+row.quantity,0),10);
assert.equal(new Set(rows.map(variantIdentity)).size,3);
assert.deepEqual(rows.map(row=>[row.size,row.color,row.material,row.quantity]),[
  ["S","Red","Cotton",2],["M","Red","Cotton",3],["L","Blue","Linen",5]]);
assert.throws(()=>parseProductVariants([]),/at least one/);
assert.throws(()=>parseProductVariants([draft("S","Red","Cotton","2"),draft("s"," red ","COTTON","2")]),/duplicate/);
assert.throws(()=>parseProductVariants([draft("M","Red","Cotton","-1")]),/whole number/);
assert.throws(()=>parseProductVariants([draft("M","Red","Cotton","2.5")]),/whole number/);
assert.throws(()=>parseProductVariants([draft("M","Red","Cotton","Infinity")]),/whole number/);
assert.throws(()=>parseProductVariants([draft("","","","5")]),/enter size/);
assert.throws(()=>parseProductVariants([draft("M","Red","Cotton","2")],[{size:"m",color:"red",material:"cotton"}]),/duplicate/);
assert.throws(()=>parseProductVariants([draft("M","Red","Cotton","2","SKU-1","SKU-1")]),/duplicated/);
assert.equal(parseProductVariants([draft("L","Blue","Cotton","0")])[0].quantity,0);

const labels = fs.readFileSync(new URL("../packages/business-logic/src/barcode-labels.ts", import.meta.url), "utf8");
assert.match(labels, /Size: \$\{escapeHtml\(product\.size\)\}/);
assert.match(labels, /Colour: \$\{escapeHtml\(product\.color\)\}/);
assert.match(labels, /Material: \$\{escapeHtml\(product\.fabric\)\}/);
assert.match(labels, /<div class="price">/);

const checkout = fs.readFileSync(new URL("../packages/business-logic/src/sale-checkout-guard.ts", import.meta.url), "utf8");
assert.match(checkout, /if \(live\.hasVariants\) errors\.push/);
const group = fs.readFileSync(new URL("../packages/business-logic/src/product-variant-family.ts", import.meta.url), "utf8");
assert.match(group, /stockQuantity: row\.quantity/);
assert.match(group, /parentProductId: parent\.id/);
assert.match(group, /generateProductBarcode/);
console.log("Boutique variants 10-piece / size-colour-material / label / billing smoke PASS");
