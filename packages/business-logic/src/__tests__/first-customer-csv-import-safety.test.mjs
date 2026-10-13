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
