import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename,
);
const { buildSaleFinancialEnvelope } = require("../financial-sync-envelope.ts");
const { fixture, IDS, scope } = await import("./financial-sync-envelope.test.mjs");

function review(snapshot) {
  snapshot.outbox[0].payload = structuredClone(snapshot.sales[0]);
  return buildSaleFinancialEnvelope(snapshot, IDS.saleEvent, scope);
}

test("accepts an unchanged valid split-payment invoice and leaves all source records untouched", () => {
  const snap = fixture();
  const before = structuredClone(snap);
  const envelope = review(snap);
  assert.equal(envelope.operation, "sale.post");
  assert.equal(envelope.payments.length, 2);
  assert.deepEqual(snap, before);
});

test("rejects manipulated line totals despite a matching sale payload and balanced journal", () => {
  const snap = fixture();
  snap.sales[0].items[0].lineTotal = 126;
  const result = review(snap);
  assert.equal(result.held, "sale_line_economics_conflict");
  assert.equal(snap.outbox[0].status, "pending");
});

test("rejects inflated invoice/payment/journal that remains internally balanced but disagrees with real item prices", () => {
  const snap = fixture();
  snap.sales[0].total = 126;
  snap.sales[0].paidAmount = 126;
  snap.payments[1].amount = 46;
  snap.outbox[2].payload = structuredClone(snap.payments[1]);
  const journal = snap.accounting.journals[0];
  journal.totalDebit = 126; journal.totalCredit = 126;
  journal.lines[1].debit = 46;
  journal.lines[2].credit = 126;
  assert.equal(review(snap).held, "sale_invoice_totals_conflict");
  assert.ok(snap.outbox.every(e => e.status === "pending"));
});

test("repeated sale-line identity is held even if milli-unit stock and invoice totals reconcile", () => {
  const snap = fixture();
  const item = snap.sales[0].items[0];
  snap.sales[0].items = [
    { ...item, quantity: 0.625, lineTotal: 62.5 },
    { ...item, quantity: 0.625, lineTotal: 62.5 },
  ];
  assert.equal(review(snap).held, "invalid_sale_item_precision");
});

test("finite item discounts and taxes are reconciled using checkout's minor-unit rounding", () => {
  const snap = fixture();
  const item = snap.sales[0].items[0];
  item.discountPercent = 10;
  item.taxRate = 10;
  item.lineTotal = 123.75;
  snap.sales[0].discountAmount = 12.5;
  snap.sales[0].taxAmount = 11.25;
  snap.sales[0].total = 123.75;
  snap.sales[0].paidAmount = 123.75;
  snap.payments[1].amount = 43.75;
  snap.outbox[2].payload = structuredClone(snap.payments[1]);
  const journal = snap.accounting.journals[0];
  journal.totalDebit = 123.75; journal.totalCredit = 123.75;
  journal.lines[1].debit = 43.75;
  journal.lines[2].credit = 123.75;
  const result = review(snap);
  assert.equal(result.operation, "sale.post");
  assert.equal(result.sale.total, 123.75);
  assert.equal(result.sale.items[0].lineTotal, 123.75);
});

test("malformed negative or nonfinite tax/discount rates fail closed", () => {
  for (const patch of [
    { discountPercent: -1 },
    { discountPercent: 101 },
    { discountPercent: Infinity },
    { taxRate: -2 },
    { taxRate: NaN },
  ]) {
    const snap = fixture();
    Object.assign(snap.sales[0].items[0], patch);
    assert.equal(review(snap).held, "invalid_sale_item_precision");
  }
});
