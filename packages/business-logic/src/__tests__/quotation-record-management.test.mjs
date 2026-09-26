import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const permissions = require("../permissions.ts");
const store = require("../store.ts");
const quotations = require("../quotations.ts");

permissions.setCurrentRole("admin");
store.hydrateCore({
  customers: [{
    id: "cust-1", name: "Test Customer", phone: "9999999999", email: null, address: null, gstin: null,
    loyaltyPoints: 0, totalSpent: 0, outstandingBalance: 0, tags: [], notes: null,
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", deletedAt: null, version: 1,
  }],
});
quotations.hydrateQuotations({
  quotations: [{
    id: "q-1", quotationNumber: "QT-TEST-001", customerId: "cust-1", customerName: "Test Customer", status: "draft",
    lines: [{ id: "ql-1", kind: "service", productId: null, description: "Original", quantity: 1, unitPrice: 100, lineTotal: 100 }],
    materialCharges: 0, labourCharges: 0, subtotal: 100, discount: 0, tax: 0, total: 100, advance: 0, balance: 100,
    validUntil: null, notes: null, convertedSaleId: null, convertedOrderId: null,
    createdAt: "2026-09-10T10:00:00.000Z", updatedAt: "2026-09-10T10:00:00.000Z", deletedAt: null, version: 1,
  }],
});

assert.equal(quotations.canEditQuotation(quotations.getQuotation("q-1")), true);
assert.equal(quotations.canArchiveQuotation(quotations.getQuotation("q-1")), true);
const statusChange = quotations.setQuotationStatus("q-1", "sent");
assert.equal(statusChange.error, undefined);
assert.equal(statusChange.quotation.status, "sent");
assert.equal(quotations.canSetQuotationStatus(statusChange.quotation, "accepted"), true);
assert.equal(quotations.canSetQuotationStatus(statusChange.quotation, "draft"), false);
assert.match(quotations.setQuotationStatus("q-1", "draft").error, /Invalid quotation status transition/);

const edited = quotations.updateQuotation("q-1", {
  customerId: "cust-1",
  lines: [
    { kind: "service", description: "Alteration", quantity: 2, unitPrice: 125 },
    { kind: "material", description: "Material", quantity: 1, unitPrice: 50 },
  ],
  materialCharges: 25,
  labourCharges: 10,
  discount: 15,
  tax: 18,
  advance: 50,
  validUntil: "2026-10-01",
  notes: "Updated quote",
});
assert.deepEqual(edited.errors, []);
assert.ok(edited.quotation);
assert.equal(edited.quotation.subtotal, 335);
assert.equal(edited.quotation.total, 338);
assert.equal(edited.quotation.balance, 288);
assert.equal(edited.quotation.version, 2);
assert.equal(edited.quotation.lines.length, 2);

assert.equal(quotations.listQuotations({ dateFrom: "2026-09-11" }).length, 0);
assert.equal(quotations.listQuotations({ dateTo: "2026-09-10" }).length, 1);
assert.equal(quotations.listQuotations({ query: "test customer" }).length, 1);

const archived = quotations.archiveQuotation("q-1", "Customer declined");
assert.ok(archived.quotation);
assert.ok(archived.quotation.deletedAt);
assert.equal(quotations.listQuotations().length, 0);

quotations.hydrateQuotations({
  quotations: [{
    ...edited.quotation,
    id: "q-2", quotationNumber: "QT-TEST-002", status: "converted", deletedAt: null, convertedSaleId: "sale-1",
  }],
});
assert.equal(quotations.canEditQuotation(quotations.getQuotation("q-2")), false);
assert.equal(quotations.canArchiveQuotation(quotations.getQuotation("q-2")), false);
assert.match(quotations.setQuotationStatus("q-2", "draft").error, /Already converted/);
assert.match(quotations.updateQuotation("q-2", {
  customerId: "cust-1",
  lines: [{ kind: "service", description: "Blocked", quantity: 1, unitPrice: 1 }],
}).errors.join(" "), /Only draft or sent quotations/);
assert.match(quotations.archiveQuotation("q-2", "No").error, /cannot be archived/);

console.log("Quotation record management PASS");
