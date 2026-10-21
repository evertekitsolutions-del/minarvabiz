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
const { buildPostedSupplierCostComparison } = require("../supplier-posted-cost-comparison.ts");
const prod = { id:"p1", sku:"HDD-1", unit:"pcs", branchId:"b1" };
const suppliers = [{id:"s1", name:"Supplier 1",branchId:"b1"},
                   {id:"s2", name:"Supplier 2",branchId:"b1"}];
const inv=(id, supplierId, unitCost, date, patch={})=>({
  id, supplierId, invoiceNumber:"PINV-"+id, invoiceDate:date,
  status:"posted", branchId:"b1", lines:[{id:id+"-l", productId:"p1",unitCost,invoicedQuantity:2}],
  ...patch,
});
const compare=(invoices, product=prod, allSuppliers=suppliers, branch="b1")=>
  buildPostedSupplierCostComparison(product,allSuppliers,invoices,branch);

test("posted tax-exclusive unit prices sort cheapest supplier first, track price range and deterministic latest invoice",()=>{
  const invoices=[
    inv("a","s1",105,"2026-09-01"),
    inv("b","s1",120,"2026-10-01"),
    inv("c","s2",100,"2026-09-28"),
  ];
  const before=JSON.stringify(invoices);
  const rows=compare(invoices);
  assert.deepEqual(rows.map(x=>x.supplierId),["s2","s1"]);
  assert.deepEqual([rows[0].latestUnitCost,rows[0].premiumToLowestPercent,
    rows[0].lowestUnitCost,rows[0].highestUnitCost],[100,0,100,100]);
  assert.deepEqual([rows[1].latestUnitCost,rows[1].lowestUnitCost,
    rows[1].highestUnitCost,rows[1].premiumToLowestPercent,
    rows[1].observedLines,rows[1].lastInvoiceNumber,rows[1].lastInvoiceDate],
    [120,105,120,20,2,"PINV-b","2026-10-01"]);
  assert.equal(JSON.stringify(invoices),before);
});

test("ignore drafts, cancelled documents, unrelated products and unauthorized suppliers/branches",()=>{
  const invoices=[
    inv("a","s1",10,"2026-10-01",{status:"draft"}),
    inv("b","s1",10,"2026-10-01",{status:"cancelled"}),
    inv("c","s1",10,"2026-10-01",{cancelledAt:"2026-10-02"}),
    inv("d","s1",10,"2026-10-01",{branchId:"b2"}),
    inv("e","s2",10,"2026-10-01",{lines:[{id:"l",productId:"not-p1",unitCost:1,invoicedQuantity:1}]}),
    inv("f","s1",150,"2026-10-01",{status:"partially_paid"}),
  ];
  assert.deepEqual(compare(invoices).map(x=>[x.supplierId,x.latestUnitCost]),[["s1",150]]);
  assert.deepEqual(compare([inv("g","s1",10,"2026-10-01")],prod,[{id:"s1",name:"Wrong branch",branchId:"b2"}]),[]);
  assert.throws(()=>compare([], {...prod,branchId:"b2"}),/authorized branch/);
  assert.throws(()=>compare([], {...prod,deletedAt:"2026-10-01"}),/unavailable/);
});

test("same-day tie sorting is independent of input order",()=>{
  const older=inv("id-a","s1",55,"2026-10-05"),newer=inv("id-z","s1",90,"2026-10-05");
  assert.deepEqual(compare([older,newer]),compare([newer,older]));
  assert.equal(compare([older,newer])[0].latestUnitCost,90);
});

test("invalid prices, quantity and duplicate posted invoice IDs fail closed",()=>{
  for(const cost of [-1,NaN,Infinity,1.001])assert.throws(()=>compare([inv("x","s1",cost,"2026-10-01")]));
  for(const qty of [0,-2,Infinity])assert.throws(()=>compare([
    inv("x","s1",10,"2026-10-01",{lines:[{id:"l",productId:"p1",unitCost:10,invoicedQuantity:qty}]}),
  ]),/quantity/);
  assert.throws(()=>compare([inv("a","s1",100,"2026-10-01"),inv("a","s1",100,"2026-10-01")]),/Duplicate/);
  assert.throws(()=>compare([inv("a","s1",100,"2026-02-30")]),/date/);
});

test("zero-cost supplier does not fabricate relative savings percentages",()=>{
  const rows=compare([inv("a","s1",0,"2026-10-01"),inv("b","s2",10,"2026-10-01")]);
  assert.equal(rows[0].premiumToLowestPercent,0);
  assert.equal(rows[1].premiumToLowestPercent,null);
  assert.deepEqual(compare([]),[]);
});

test("shared Procurement screen exposes explicit posted-cost comparison",()=>{
  const ui=fs.readFileSync(new URL("../../../ui/src/components/purchases/ProcurementPanel.tsx",import.meta.url),"utf8");
  assert.match(ui,/Supplier purchase price history/);
  assert.match(ui,/buildPostedSupplierCostComparison/);
  assert.match(ui,/Only posted supplier invoice costs/);
});
