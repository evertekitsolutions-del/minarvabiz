import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename,
);
const { calculateLineItem, calculateInvoiceTotals } = require("@minarvabiz/billing");
const { calculateCartTotals, cartLineToSaleItem } = require("../sales.ts");

const item = (price, rate, qty = 1, discount = 0) =>
  ({ unitPrice: price, taxRate: rate, quantity: qty, discountPercent: discount, taxInclusive: true });

test("Boutique: Price ₹100 includes 18% GST, never adds GST to checkout", () => {
  const v = calculateLineItem(item(100, 18));
  assert.deepEqual(v, {
    subtotal: 84.75, discountAmount: 0, taxableAmount: 84.75,
    taxAmount: 15.25, total: 100,
  });
  const invoice = calculateInvoiceTotals({ items: [item(100, 18)] });
  assert.deepEqual(invoice, {
    itemsSubtotal: 84.75, itemsDiscount: 0, itemsTax: 15.25,
    globalDiscount: 0, globalTax: 0, grandTotal: 100,
  });
});

test("Boutique: fractional, multiple, and one-paisa prices preserve exact payable gross", () => {
  for (const rate of [0, 5, 12, 18, 28]) {
    for (const price of [0.01, 1, 99.99, 100, 199.99, 499, 99999.99]) {
      for (const qty of [1, 2, 3]) {
        const result = calculateLineItem(item(price, rate, qty));
        assert.equal(result.total, Math.round(price * qty * 100) / 100, String({ price, rate, qty }));
        assert.equal(Math.round((result.taxableAmount + result.taxAmount) * 100), Math.round(result.total * 100));
      }
    }
  }
  assert.equal(calculateLineItem(item(100, 18, 0.5)).total, 50);
});

test("Boutique: any explicit discount reduces gross without re-adding GST", () => {
  const v = calculateLineItem(item(100, 18, 1, 10));
  assert.equal(v.total, 90);
  assert.equal(v.subtotal, 84.75);
  assert.equal(v.taxAmount, 13.73);
  assert.equal(v.taxableAmount, 76.27);
  assert.equal(v.discountAmount, 8.48);
});

test("Boutique: sale snapshot carries inclusive price through posting and refunds", () => {
  const line = {
    productId: "p1", productName: "Saved garment", quantity: 1,
    unitPrice: 100, costPrice: 40, discountPercent: 0, taxRate: 18,
    taxInclusive: true, stockQuantity: 3,
  };
  const totals = calculateCartTotals([line]);
  assert.equal(totals.itemsSubtotal, 84.75);
  assert.equal(totals.itemsTax, 15.25);
  assert.equal(totals.grandTotal, 100);
  const saved = cartLineToSaleItem(line, "s1", "i1");
  assert.equal(saved.unitPrice, 100);
  assert.equal(saved.taxInclusive, true);
  assert.equal(saved.lineTotal, 100);
  assert.equal(calculateLineItem(saved).taxAmount, 15.25);
});

test("Ordinary ERP invoices remain tax-exclusive unless explicitly opted in", () => {
  assert.equal(calculateLineItem({ quantity: 1, unitPrice: 100, taxRate: 18 }).total, 118);
  assert.equal(calculateInvoiceTotals({ items: [
    item(100, 18), { quantity: 1, unitPrice: 100, taxRate: 18 },
  ] }).grandTotal, 218);
});

test("Boutique price entry, saved legacy MRP display and thermal labels have one Price", () => {
  const root = new URL("../../../../", import.meta.url);
  const read = (path) => fs.readFileSync(new URL(path, root), "utf8");
  const editor = read("apps/desktop/src/components/ProductEditorModal.tsx");
  const app = read("apps/desktop/src/App.tsx");
  const label = read("packages/business-logic/src/barcode-labels.ts");
  const productList = read("packages/ui/src/components/products/ProductList.tsx");
  const pos = read("packages/ui/src/components/sales/PosBilling.tsx");
  const normal = read("packages/ui/src/components/sales/NormalBilling.tsx");
  assert.match(editor, /label="Price \*"/);
  assert.doesNotMatch(editor, /Special offer price|label="MRP/);
  assert.match(app, /sellingPrice:price,mrp:price/);
  assert.match(app, /<ProductList singlePrice/);
  assert.match(app, /<PosBilling pricesIncludeTax/);
  assert.match(app, /<NormalBilling pricesIncludeTax/);
  assert.match(label, /Price: \\$\\{formatMoney\\(product\\.mrp != null && product\\.mrp > 0 \\? product\\.mrp : product\\.sellingPrice\\)\\}/);
  assert.doesNotMatch(label, /Offer:|MRP:/);
  assert.match(productList, /header: singlePrice \? "Price"/);
  assert.match(productList, /singlePrice \? "Price"/);
  assert.match(pos, /taxInclusive: pricesIncludeTax/);
  assert.match(normal, /taxInclusive: pricesIncludeTax/);
});
