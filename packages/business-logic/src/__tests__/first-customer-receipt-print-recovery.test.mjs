import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText,
  file,
);
const { requestSaleReceiptPrint, requestOrderReceiptPrint } = require("../receipt.ts");
const settings = require("../print-settings.ts");
settings.hydratePrintSettings({
  defaultInvoicePaper: "thermal", thermalWidthMm: 80,
  a4PrinterName: "A4 Printer", thermalPrinterName: "Receipt Printer",
  labelPrinterName: "", labelWidthMm: 50, labelHeightMm: 30,
  silentDesktopPrint: false, updatedAt: "2026-10-26T09:00:00.000Z",
});
const date = "2026-10-26T09:00:00.000Z";
const sale = {
  id: "sale-receipt-1", invoiceNumber: "INV-RECEIPT-1", customerId: null, customerName: "Walk-in",
  saleDate: date, subtotal: 100, discountAmount: 0, taxAmount: 0, total: 100,
  paidAmount: 100, balanceAmount: 0, status: "completed", notes: "",
  items: [{ id: "line-1", saleId: "sale-receipt-1", productId: "p1", productName: "Test Item",
    quantity: 1, unitPrice: 100, costPrice: 50, discountPercent: 0, taxRate: 0, lineTotal: 100 }],
  createdAt: date, updatedAt: date, version: 1,
};
const order = {
  id: "service-1", orderNumber: "SRV-RECEIPT-1", customerId: null, customerName: "Walk-in",
  orderDate: date, deliveryDate: null, serviceType: "computer_service", status: "completed",
  price: 100, discount: 0, advance: 100, balance: 0, notes: "",
};
const originalWindow = globalThis.window;
test.afterEach(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

test("sale receipt reports a blocked browser popup so the saved invoice can be retried", async () => {
  globalThis.window = { open: () => null };
  const result = await requestSaleReceiptPrint(sale);
  assert.equal(result.ok, false);
  assert.equal(result.state, "blocked");
  assert.match(result.error, /blocked/i);
});

test("service receipt reports native printer rejection and does not fall through to browser printing", async () => {
  let browserOpened = false;
  globalThis.window = {
    minarvaDesktop: { printHtml: async () => ({ ok: false, error: "Configured printer was not found" }) },
    open: () => { browserOpened = true; return null; },
  };
  const result = await requestOrderReceiptPrint(order);
  assert.equal(result.ok, false);
  assert.match(result.error, /printer was not found/i);
  assert.equal(browserOpened, false);
});

test("browser receipt print distinguishes opening the print window from physical output", async () => {
  let opened = 0, writes = 0, closed = 0;
  globalThis.window = {
    open: (_url, _target, dimensions) => {
      opened++;
      assert.match(dimensions, /width=400/);
      return {
        document: {
          write: html => { assert.match(html, /INV-RECEIPT-1/); writes++; },
          close: () => { closed++; },
        },
      };
    },
  };
  const result = await requestSaleReceiptPrint(sale);
  assert.deepEqual(result, { ok: true, state: "browser-window-opened" });
  assert.equal(opened, 1);
  assert.equal(writes, 1);
  assert.equal(closed, 1);
});

test("service receipt browser write failure is returned and closes the partial popup", async () => {
  let closed = 0;
  globalThis.window = {
    open: () => ({
      document: { write: () => { throw new Error("document unavailable"); } },
      close: () => { closed++; },
    }),
  };
  const result = await requestOrderReceiptPrint(order);
  assert.equal(result.ok, false);
  assert.match(result.error, /document unavailable/);
  assert.equal(closed, 1);
});
