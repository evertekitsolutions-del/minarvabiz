import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    },
  }).outputText, filename,
);
const templates = require("../print-settings.ts");
const invoice = require("../invoice.ts");
const quotations = require("../quotations.ts");

const createdAt = "2026-10-19T09:00:00.000Z";
const sale = {
  id: "sale-print-kind", invoiceNumber: "INV-PRINT-KIND",
  customerId: null, customerName: "Walk-in",
  saleDate: createdAt, items: [],
  subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0,
  paidAmount: 0, balanceAmount: 0, notes: null,
};
const service = {
  id: "service-print-kind", orderNumber: "SRV-PRINT-KIND",
  customerId: null, customerName: "Walk-in",
  orderDate: createdAt, deliveryDate: null, serviceType: "computer_service",
  price: 100, discount: 0, advance: 0, balance: 100, notes: null,
};
const quotation = {
  id: "quote-print-kind", quotationNumber: "QT-PRINT-KIND",
  customerId: null, customerName: "Walk-in",
  lines: [], createdAt, validUntil: null, status: "draft",
  materialCharges: 0, labourCharges: 0, subtotal: 0,
  discount: 0, tax: 0, total: 0, advance: 0, balance: 0, notes: null,
};

test("an explicit quotation ID cannot turn sale or service invoice into a quotation", () => {
  templates.resetPrintTemplates();
  const a4Quote = templates.getPrintTemplate("quotation", "a4");
  const a4Invoice = templates.getPrintTemplate("invoice", "a4");
  assert.equal(templates.getPrintTemplateFor("invoice", "a4", a4Quote.id).id, a4Invoice.id);
  assert.match(invoice.buildSaleInvoiceHtml(sale, { paper: "a4", templateId: a4Quote.id, autoPrint: false }), /TAX INVOICE/);
  assert.doesNotMatch(invoice.buildSaleInvoiceHtml(sale, { paper: "a4", templateId: a4Quote.id, autoPrint: false }), /class="doc-title">QUOTATION/);
  assert.match(invoice.buildOrderInvoiceHtml(service, { paper: "a4", templateId: a4Quote.id, autoPrint: false }), /TAX INVOICE/);
  assert.equal(templates.getPrintTemplateFor("invoice", "a4", "missing-template").id, a4Invoice.id);
});

test("an explicit invoice ID cannot turn quotation printing into an invoice", () => {
  templates.resetPrintTemplates();
  const a4Invoice = templates.getPrintTemplate("invoice", "a4");
  const a4Quote = templates.getPrintTemplate("quotation", "a4");
  assert.equal(templates.getPrintTemplateFor("quotation", "a4", a4Invoice.id).id, a4Quote.id);
  const html = quotations.buildQuotationHtml(quotation, { paper: "a4", templateId: a4Invoice.id, autoPrint: false });
  assert.match(html, /class="doc-title">QUOTATION/);
  assert.doesNotMatch(html, /class="doc-title">TAX INVOICE/);
});

test("wrong-paper template never changes A4 or thermal print layout", () => {
  templates.resetPrintTemplates();
  const thermalInvoice = templates.getPrintTemplate("invoice", "thermal");
  const a4Invoice = templates.getPrintTemplate("invoice", "a4");
  const a4Quote = templates.getPrintTemplate("quotation", "a4");
  const thermalQuote = templates.getPrintTemplate("quotation", "thermal");
  assert.equal(templates.getPrintTemplateFor("invoice", "a4", thermalInvoice.id).id, a4Invoice.id);
  assert.equal(templates.getPrintTemplateFor("quotation", "thermal", a4Quote.id).id, thermalQuote.id);
  const a4Html = invoice.buildSaleInvoiceHtml(sale, { paper: "a4", templateId: thermalInvoice.id, autoPrint: false });
  const thermalHtml = quotations.buildQuotationHtml(quotation, { paper: "thermal", templateId: a4Quote.id, autoPrint: false });
  assert.match(a4Html, /@page\{size:A4/);
  assert.match(thermalHtml, /@page\{size:80mm 297mm/);
  const custom = templates.savePrintTemplate({ ...a4Invoice, id: "custom-matching-invoice-a4", isSystem: false, heading: "CUSTOM ACCEPTED INVOICE", isDefault: true });
  assert.equal(templates.getPrintTemplateFor("invoice", "a4", custom.id).id, custom.id);
  assert.match(invoice.buildSaleInvoiceHtml(sale, { paper: "a4", templateId: custom.id, autoPrint: false }), /CUSTOM ACCEPTED INVOICE/);
});

test("rapid duplication always uses distinct IDs and deleting one does not delete another", () => {
  templates.resetPrintTemplates();
  const source = templates.getPrintTemplate("invoice", "a4");
  const originalNow = Date.now;
  try {
    Date.now = () => 1792400000000;
    const copies = Array.from({ length: 3 }, () => templates.duplicatePrintTemplate(source.id));
    assert.ok(copies.every(Boolean));
    const ids = copies.map((copy) => copy.id);
    assert.equal(new Set(ids).size, 3);
    assert.ok(ids.every((id) => id.startsWith("custom-1792400000000")));
    assert.equal(templates.listPrintTemplates().filter((t) => ids.includes(t.id)).length, 3);
    assert.equal(templates.deletePrintTemplate(ids[0]).ok, true);
    assert.equal(templates.getPrintTemplateById(ids[0]), null);
    assert.ok(templates.getPrintTemplateById(ids[1]));
    assert.ok(templates.getPrintTemplateById(ids[2]));
    assert.equal(templates.getPrintTemplate("invoice", "a4").id, source.id);
  } finally {
    Date.now = originalNow;
    templates.resetPrintTemplates();
  }
});
