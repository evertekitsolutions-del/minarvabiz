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
const csv = require("../csv-import.ts");
const store = require("../store.ts");
const permissions = require("../permissions.ts");
const outbox = require("../outbox-bridge.ts");
const accounting = require("../accounting-store.ts");
permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);

function reset() {
  store.hydrateCore({customers: [], products: [], sales: [], payments: []});
  outbox.hydrateOutbox([]);
}
function snapshot() {
  return JSON.stringify({products:store.listProducts(),outbox:outbox.exportOutbox(),ledger:accounting.exportAccountingState()});
}

test("multi-line quoted product name parses as one physical CSV record and retains all columns", () => {
  reset();
  const result = csv.parseProductCsv('name,sku,barcode,cost,price,stock,min,unit\n"Premium,\nFabric",FAB-1,ABC123,12.5,20,1.25,0.5,m');
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].name,"Premium,\nFabric");
  assert.equal(result.rows[0].stock,1.25);
  assert.equal(result.rows[0].unit,"m");
});

test("duplicate and ambiguous CSV headers fail closed before business writes", () => {
  reset();
  for(const content of [
    "name,SKU,sku,stock\nFabric,001,002,1",
    "name,stock,Stock\nFabric,1,5",
    "name,name,price\nFabric,Other,20",
    "name,sku\nFabric",
    "name,price\nFabric,12,extra",
  ]) {
    const before=snapshot();
    const preview=csv.parseProductCsv(content);
    assert.ok(preview.errors.length, content);
    const result=csv.importProductsFromCsv(content);
    assert.equal(result.created,0,content);
    assert.deepEqual(snapshot(),before,content);
  }
});

test("unsafe money, stock, fractional quantities and opening values are refused before any import", () => {
  reset();
  for(const line of [
    "Fabric,F-01,10.123,20,1.25,0.5",
    "Fabric,F-01,10,20,0.0009,0",
    "Fabric,F-01,10,20,1.0009,0",
    "Fabric,F-01,10,20,1e25,0",
    "Fabric,F-01,10000000000000,20,1000000,0",
    "Fabric,F-01,0,20,1,0.0009",
  ]) {
    const content="name,sku,cost,price,stock,min\n"+line;
    const before=snapshot();
    const preview=csv.parseProductCsv(content);
    assert.ok(preview.errors.length,content);
    assert.equal(csv.importProductsFromCsv(content).created,0);
    assert.equal(snapshot(),before,content);
  }
});

test("no partial customer opening-stock posting when later CSV row is invalid", () => {
  reset();
  const before=snapshot();
  const content="name,sku,cost,price,stock,min\nFirst,F-100,12.5,20,2,0\nSecond,F-200,0.001,20,1,0";
  const result=csv.importProductsFromCsv(content);
  assert.equal(result.created,0);
  assert.ok(result.errors.length>0);
  assert.equal(snapshot(),before);
});

test("valid two-product import posts opening stock, exports unchanged records and avoids double commit", () => {
  reset();
  const beforeProducts=store.listProducts().length;
  const content="name,sku,cost,price,stock,min\nFabric-A,NEW-CSV-A,10.5,20,2,0\nFabric-B,NEW-CSV-B,5,12,1.25,0";
  const preview=csv.parseProductCsv(content);
  assert.deepEqual(preview.errors,[]);
  assert.equal(preview.rows.length,2);
  const result=csv.importProductsFromCsv(content);
  assert.equal(result.created,2);
  assert.equal(store.listProducts().length,beforeProducts+2);
  const a=store.listProducts().find(p=>p.sku==="NEW-CSV-A");
  const b=store.listProducts().find(p=>p.sku==="NEW-CSV-B");
  assert.equal(a.stockQuantity,2);
  assert.equal(b.stockQuantity,1.25);
  assert.ok(outbox.exportOutbox().some(e=>e.aggregateType==="products" && e.aggregateId===a.id));
  const inventory=accounting.buildTrialBalance();
  assert.ok(inventory.length>0);
  const duplicate=csv.importProductsFromCsv(content);
  assert.equal(duplicate.created,0);
  assert.ok(duplicate.errors.some(e=>e.includes("already exists")));
  assert.equal(store.listProducts().length,beforeProducts+2);
});

for (const conflict of [
  { name: "case-insensitive SKU", sku: "archived-sku", barcode: "UNUSED-BARCODE", error: /SKU.*already exists/ },
  { name: "barcode", sku: "UNUSED-SKU", barcode: "ARCHIVED-BARCODE", error: /barcode.*already exists/ },
]) {
  test(`archived product ${conflict.name} collision refuses the full CSV batch and permits corrected retry`, () => {
    reset();
    const archived = store.createProduct({
      name: "Archived product", sku: "ARCHIVED-SKU", barcode: "ARCHIVED-BARCODE",
      unit: "pcs", costPrice: 10, sellingPrice: 20, stockQuantity: 0,
      minimumStock: 0, isActive: true,
    });
    assert.equal(store.archiveProduct(archived.id, "Replaced catalogue").product?.id, archived.id);
    const fullState = () => JSON.stringify({
      products: store.listProducts(), archived: store.listArchivedProducts(),
      outbox: outbox.exportOutbox(), ledger: accounting.exportAccountingState(),
    });
    const before = fullState();
    const header = "name,sku,barcode,cost,price,stock,min,unit\n";
    const firstRow = "First new product,NEW-SKU,NEW-BARCODE,10,20,2,0,pcs\n";
    const source = header + firstRow +
      `Conflicting product,${conflict.sku},${conflict.barcode},5,12,1.25,0,pcs`;
    const preview = csv.parseProductCsv(source);
    const result = csv.importProductsFromCsv(source);
    assert.equal(result.created, 0, "a later archived collision must reject every row");
    assert.match(preview.errors.join("; "), conflict.error);
    assert.match(result.errors.join("; "), conflict.error);
    assert.equal(fullState(), before, "refusal must preserve active/archived products, outbox and accounting");

    const corrected = header + firstRow +
      "Corrected product,CORRECTED-SKU,CORRECTED-BARCODE,5,12,1.25,0,pcs";
    assert.deepEqual(csv.importProductsFromCsv(corrected), { created: 2, errors: [] });
    assert.equal(store.listProducts().length, 2);
    assert.equal(store.listProducts().find(product => product.sku === "NEW-SKU").stockQuantity, 2);
    assert.equal(store.listProducts().find(product => product.sku === "CORRECTED-SKU").stockQuantity, 1.25);
    assert.equal(store.listArchivedProducts().length, 1);
    assert.equal(store.restoreArchivedProduct(archived.id).product?.id, archived.id);
    assert.equal(store.listArchivedProducts().length, 0);
    const restoredProducts = store.listProducts();
    assert.equal(restoredProducts.length, 3);
    assert.equal(new Set(restoredProducts.map(product => product.sku.toLowerCase())).size, 3);
    assert.equal(new Set(restoredProducts.map(product => product.barcode)).size, 3);
    assert.equal(store.getProductByBarcode("ARCHIVED-BARCODE")?.id, archived.id);
  });
}

test("products UI must have file preview, explicit confirm and downloadable CSV template", () => {
  const ui=fs.readFileSync("apps/web/src/app/(app)/products/page.tsx","utf8");
  assert.match(ui,/parseProductCsv/);
  assert.match(ui,/importProductsFromCsv/);
  assert.match(ui,/Preview import/);
  assert.match(ui,/Confirm import/);
  assert.match(ui,/Download CSV template/);
  assert.match(ui,/accept="\.csv,text\/csv"/);
  assert.match(ui,/csvPreview\.errors\.length/);
});

test("product CSV export neutralizes formula-capable master data without changing amounts or records", () => {
  const products = [{
    name: '=HYPERLINK("https://unsafe.invalid")',
    sku: "\t@UNSAFE",
    barcode: " \uFEFF-EXEC",
    costPrice: 12.5,
    sellingPrice: 20,
    stockQuantity: 2,
    minimumStock: 0.25,
    unit: "+SUM(1,1)",
  }, {
    name: 'Premium, "A"',
    sku: "SAFE-100",
    barcode: "890123456",
    costPrice: 10,
    sellingPrice: 15,
    stockQuantity: 1.25,
    minimumStock: 0,
    unit: "m",
  }];
  const before = JSON.stringify(products);
  const exported = csv.exportProductsCsv(products);
  assert.equal(JSON.stringify(products), before, "export must be read-only");
  assert.ok(exported.includes("\"'=HYPERLINK(\"\"https://unsafe.invalid\"\")\""), "formula product names must be inert");
  assert.ok(exported.includes("'\t@UNSAFE"), "leading tabs must not enable formulas");
  assert.ok(exported.includes("' \uFEFF-EXEC"), "BOM/space-prefixed payloads must be inert");
  assert.ok(exported.includes("\"'+SUM(1,1)\""), "unit metadata must be protected");
  assert.ok(exported.includes(",12.5,20,2,0.25,"), "numeric stock/accounting fields must remain unmodified");
  assert.ok(exported.includes('"Premium, ""A""",SAFE-100,890123456,10,15,1.25,0,m'), "ordinary CSV text should retain quoted formatting");
  assert.equal(csv.exportProductsCsv([]), "name,sku,barcode,cost,price,stock,min,unit");
});
