import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  },
).outputText, filename);

const csv = require("../csv-import.ts");
const suppliers = require("../phase5-store.ts");
const permissions = require("../permissions.ts");
const accounting = require("../accounting-store.ts");
permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);

function reset() {
  suppliers.hydratePhase5({ suppliers: [], laundryOrders: [], expenses: [], purchases: [], expenseCategories: [] });
}
function snapshot() {
  return JSON.stringify({ suppliers: suppliers.exportPhase5State().suppliers, accounting: accounting.exportAccountingState() });
}

test("supplier CSV preview parses BOM, quoted CRLF, and does not write", () => {
  reset();
  const before = snapshot();
  const preview = csv.parseSupplierCsv('\uFEFFname,company,phone,email,address,category,notes\r\n"ACME, Ltd",Supply,+91 98765 43210,a@example.com,"Near, Town",materials,"First\r\ncontact"');
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.rows.length, 1);
  assert.equal(preview.rows[0].name, "ACME, Ltd");
  assert.equal(preview.rows[0].notes, "First\ncontact");
  assert.equal(snapshot(), before);
});

test("reject unsupported financial columns, ambiguous headers and malformed CSV before writes", () => {
  reset();
  for (const text of [
    "name,openingBalance\nVendor,125.50",
    "name,outstandingBalance\nVendor,200",
    "name,phone,PHONE\nVendor,1234567890,1234567890",
    "name,category\nVendor,materials,extra",
    "email,category\na@example.com,materials",
    'name,email\n"Vendor,a@example.com',
    "name,category\nVendor,unknown-category",
  ]) {
    const before = snapshot();
    assert.ok(csv.parseSupplierCsv(text).errors.length, text);
    const result = csv.importSuppliersFromCsv(text);
    assert.equal(result.created, 0, text);
    assert.equal(snapshot(), before, text);
  }
});

test("reject duplicate supplier phones/emails/names within CSV and existing active or archived data", () => {
  reset();
  for (const text of [
    "name,phone\nVendor A,+91 98765 43210\nVendor B,919876543210",
    "name,email\nVendor A,HI@EXAMPLE.COM\nVendor B,hi@example.com",
    "name,company\nVendor A,Acme\n vendor a ,acme",
  ]) {
    assert.equal(csv.importSuppliersFromCsv(text).created, 0, text);
  }
  suppliers.createSupplier({ name: "Existing", company: "India", phone: "+91 99887 76655", email: "OLD@EXAMPLE.COM" });
  const archived = suppliers.createSupplier({ name: "Archived Vendor", company: "Test" });
  suppliers.archiveSupplier(archived.id, "Old supplier");
  const before = snapshot();
  for (const text of [
    "name,phone\nDuplicate,919988776655",
    "name,email\nDuplicate,old@example.com",
    "name,company\nArchived Vendor,Test",
  ]) {
    const result = csv.importSuppliersFromCsv(text);
    assert.equal(result.created, 0);
    assert.match(result.errors.join(" "), /duplicate|already exists/i);
    assert.equal(snapshot(), before);
  }
});

test("confirmed supplier import has zero balances, no AP postings, and no duplicate replay", () => {
  reset();
  const before = accounting.listJournalEntries().length;
  const source = "name,company,phone,email,category,notes\nVendor A,Acme,+919876543210,a@example.com,materials,Opening vendor\nVendor B,Fabric,19876543210,b@example.com,general,Regular";
  const preview = csv.parseSupplierCsv(source);
  assert.deepEqual(preview.errors, []);
  const result = csv.importSuppliersFromCsv(source);
  assert.deepEqual(result, { created: 2, errors: [] });
  const rows = suppliers.listSuppliers();
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.openingBalance === 0 && row.outstandingBalance === 0));
  assert.equal(accounting.listJournalEntries().length, before);
  assert.equal(csv.importSuppliersFromCsv(source).created, 0);
  assert.equal(suppliers.listSuppliers().length, 2);
});

test("supplier CSV cannot be imported by a role without purchasing permission", () => {
  reset();
  permissions.setCurrentRole("cashier");
  try {
    const before = snapshot();
    const result = csv.importSuppliersFromCsv("name,phone\nDenied,1234567890");
    assert.equal(result.created, 0);
    assert.ok(result.errors.length);
    assert.equal(snapshot(), before);
  } finally {
    permissions.setCurrentRole("admin");
  }
});

test("supplier CSV export escapes spreadsheet formulas, preserves international phones and omits balances", () => {
  reset();
  suppliers.createSupplier({ name: '=HYPERLINK("test")', phone: "+919876543210", notes: "+CMD\nnotes" });
  const text = csv.exportSuppliersCsv();
  assert.match(text, /'=HYPERLINK/);
  assert.match(text, /'?\+CMD/);
  assert.match(text, /\+919876543210/);
  assert.ok(!text.includes("openingBalance"));
  assert.ok(!text.includes("outstandingBalance"));
  // Re-import preview should be validated against a fresh target store, not its own source.
  reset();
  assert.deepEqual(csv.parseSupplierCsv(text).errors, []);
});

test("Suppliers UI provides template, preview, export and explicit confirm", () => {
  const ui = fs.readFileSync("apps/web/src/app/(app)/suppliers/page.tsx", "utf8");
  for (const marker of [
    "parseSupplierCsv", "importSuppliersFromCsv", "exportSuppliersCsv",
    "Preview supplier CSV", "Download supplier CSV template", "Export suppliers CSV",
    "Confirm supplier import", 'accept=".csv,text/csv"',
  ]) assert.ok(ui.includes(marker), marker);
  assert.match(ui, /csvPreview\.errors\.length/);
});
