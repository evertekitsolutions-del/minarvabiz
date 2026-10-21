import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url), ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename,
);
const { buildRfqDraftPreview } = require("../rfq-draft-preview.ts");
const product = (id, patch = {}) => ({
  id, name: "Camera "+id, sku: "CAM-"+id, unit: "pcs", costPrice: 100,
  sellingPrice: 120, taxRate: 18, stockQuantity: 10, minimumStock: 1,
  isActive: true, createdAt: "2026-01-01", updatedAt: "2026-01-01", ...patch,
});
const supplier = (id, patch = {}) => ({ id, name: "Supplier "+id, email: id+"@example.org",
  openingBalance: 0, outstandingBalance: 0, createdAt: "2026-01-01",
  updatedAt: "2026-01-01", ...patch });
const input = {
  reference: "RFQ-2026-001", requiredBy: "2026-12-31",
  supplierIds: ["s1", "s2"],
  lines: [{productId:"p1",quantity:"2.125"}, {productId:"p2",quantity:"1"}],
  notes: "On-site delivery",
};
const run = (changes = {}, products = [product("p1"), product("p2")],
  suppliers = [supplier("s1"), supplier("s2")], branch = "b1") =>
  buildRfqDraftPreview({...input,...changes}, products, suppliers, branch);

test("RFQ produces one supplier-product row with exact milli-quantity and no mutations", () => {
  const products = [product("p1"),product("p2")], suppliers=[supplier("s1"),supplier("s2")];
  const before=JSON.stringify([products,suppliers,input]);
  const result=run({},products,suppliers);
  assert.deepEqual([result.supplierCount,result.productCount,result.rows.length],[2,2,4]);
  assert.deepEqual(result.rows.map(x=>[x.supplierId,x.productId,x.quantity]),
    [["s1","p1",2.125],["s1","p2",1],["s2","p1",2.125],["s2","p2",1]]);
  assert.equal(JSON.stringify([products,suppliers,input]),before);
});

test("no foreign, deleted, inactive or duplicate supplier/product identifiers",()=>{
  assert.throws(()=>run({},[product("p1",{branchId:"b2"}),product("p2")]),/branch/);
  assert.throws(()=>run({},[product("p1",{deletedAt:"2026-01-01"}),product("p2")]),/branch/);
  assert.throws(()=>run({},[product("p1",{isActive:false}),product("p2")]),/branch/);
  assert.throws(()=>run({},[product("p1"),product("p2")],[supplier("s1",{branchId:"b2"}),supplier("s2")]),/branch/);
  assert.throws(()=>run({supplierIds:["s1","s1"]}),/duplicate/i);
  assert.throws(()=>run({lines:[{productId:"p1",quantity:"2"},{productId:"p1",quantity:"3"}]}),/duplicate/i);
  assert.throws(()=>run({},[product("p1"),product("p1"),product("p2")]),/Duplicate catalog/);
});

test("reject invalid quantities, contract dates, oversized notes and empty RFQs",()=>{
  for(const quantity of ["0","-1","1.0001","=1+1","Infinity","1e3","9007199254740993"]){
    assert.throws(()=>run({lines:[{productId:"p1",quantity}]}));
  }
  for(const date of ["2026-02-30","2026-13-01","2026/12/01"]){
    assert.throws(()=>run({requiredBy:date}),/date/);
  }
  assert.throws(()=>run({supplierIds:[]}),/supports/);
  assert.throws(()=>run({lines:[]}),/supports/);
  assert.throws(()=>run({notes:"a".repeat(501)}),/500/);
  assert.throws(()=>run({reference:""}),/reference/);
});

test("CSV protects formula injection and multiline/quote fields",()=>{
  const result=run(
    {supplierIds:["s1"],lines:[{productId:"p1",quantity:"0.001"}],
      notes:"=bad\n\"note\""},
    [product("p1",{name:"-Camera, A"})],
    [supplier("s1",{name:"@Vendor"})]
  );
  assert.equal(result.rows[0].quantity,0.001);
  assert.match(result.csv, /"'@Vendor"/);
  assert.match(result.csv, /"'-Camera, A"/);
  assert.match(result.csv, /"\'=bad\n""note"""/);
});

test("Shared Web/Windows UI includes a no-send RFQ planner",()=>{
  const ui=fs.readFileSync(new URL("../../../ui/src/components/purchases/RfqDraftPanel.tsx",import.meta.url),"utf8");
  const host=fs.readFileSync(new URL("../../../ui/src/components/purchases/ProcurementPanel.tsx",import.meta.url),"utf8");
  assert.match(ui,/Preview RFQ/);
  assert.match(ui,/Export RFQ CSV/);
  assert.match(ui,/buildRfqDraftPreview/);
  assert.match(host,/<RfqDraftPanel/);
});
