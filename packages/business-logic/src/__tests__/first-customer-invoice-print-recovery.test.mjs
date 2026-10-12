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
  }).outputText, file,
);
const invoice = require("../invoice.ts");
const desktop = require("../desktop-print.ts");
const store = require("../store.ts");
const settings = require("../print-settings.ts");
settings.hydratePrintSettings({
  defaultInvoicePaper: "a4", thermalWidthMm: 80,
  a4PrinterName: "First Customer Printer", thermalPrinterName: "Receipt Printer",
  labelPrinterName: "", labelWidthMm: 50, labelHeightMm: 30,
  silentDesktopPrint: true, updatedAt: "2026-10-12T09:00:00.000Z",
});
const date = "2026-10-12T09:00:00.000Z";
const sale = {
  id: "sale-1", invoiceNumber: "INV-RESTORE-1", customerId: null, customerName: "Walk-in",
  saleDate: date, subtotal: 100, discountAmount: 0, taxAmount: 0,
  total: 100, paidAmount: 100, balanceAmount: 0, status: "completed",
  notes: "", items: [{
    id: "line-1", saleId: "sale-1", productId: "p1", productName: "Test Item",
    quantity: 1, unitPrice: 100, costPrice: 50, discountPercent: 0,
    taxRate: 0, lineTotal: 100,
  }], createdAt: date, updatedAt: date, version: 1,
};
const nativeInput = [];
function withDesktop(fn) {
  globalThis.window = {
    minarvaDesktop: { printHtml: fn },
    open: () => { throw new Error("Native failure must NOT fall through to browser print"); },
  };
}

test("blocked browser popups are reported without creating another sale or payment", async () => {
  const old = store.listSales().length;
  globalThis.window = { open: () => null };
  const outcome = await invoice.requestSaleInvoicePrint(sale, "a4");
  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /blocked/i);
  assert.equal(store.listSales().length, old);
});

test("browser print-window opened is not falsely claimed as physical printing", async () => {
  let opened = 0, writes = 0, closed = 0;
  globalThis.window = {
    open: (_url, _target, specs) => {
      opened++;
      assert.match(specs, /420/);
      return {
        document: { write: (html) => { assert.match(html, /INV-RESTORE-1/); writes++; }, close: () => { closed++; } },
      };
    },
  };
  const p = invoice.requestSaleInvoicePrint(sale, "thermal");
  assert.equal(opened, 1, "Popup must open synchronously within original click");
  assert.deepEqual(await p, { ok: true, state: "browser-window-opened" });
  assert.equal(writes, 1);
  assert.equal(closed, 1);
});

test("native accepted print request returns acknowledgement but no paper claim", async () => {
  withDesktop(async input => {
    nativeInput.push(input);
    return { ok: true };
  });
  const outcome = await invoice.requestSaleInvoicePrint(sale, "a4");
  assert.deepEqual(outcome, { ok: true, state: "native-accepted" });
  assert.equal(nativeInput.at(-1).deviceName, "First Customer Printer");
  assert.equal(nativeInput.at(-1).paper, "a4");
  assert.equal(nativeInput.at(-1).silent, true);
});

test("native rejected, thrown and rejected promise each surface error without browser fallback", async () => {
  for (const printer of [
    async () => ({ ok: false, error: "No printer found" }),
    () => { throw new Error("IPC unavailable"); },
    async () => { throw new Error("Printing service unreachable"); },
  ]) {
    withDesktop(printer);
    const outcome = await invoice.requestSaleInvoicePrint(sale, "thermal");
    assert.equal(outcome.ok, false);
    assert.match(outcome.error, /printer|IPC|service/i);
  }
});

test("browser document-write failure surfaces error and closes unsafe partial popup", async () => {
  let closeCalls = 0;
  globalThis.window = {
    open: () => ({
      document: { write: () => { throw new Error("document unavailable"); } },
      close: () => { closeCalls++; },
    }),
  };
  const outcome = await invoice.requestSaleInvoicePrint(sale);
  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /unavailable/);
  assert.equal(closeCalls, 1);
});

test("no window reports error and existing fire-and-forget API remains non-throwing", async () => {
  delete globalThis.window;
  const outcome = await invoice.requestSaleInvoicePrint(sale);
  assert.equal(outcome.ok, false);
  assert.equal(desktop.tryDesktopPrintHtml("test", "a4"), false);
  invoice.printSaleInvoice(sale, "a4");
});

test("Sales Page reports print failure separately from saved transaction and retries existing ID", () => {
  const page = fs.readFileSync("apps/web/src/app/(app)/sales/page.tsx", "utf8");
  assert.match(page, /requestSaleInvoicePrint\(sale, paper\)/);
  assert.match(page, /printExistingInvoice\(result.sale.id, "a4"\)/);
  assert.match(page, /Invoice \$\{sale.invoiceNumber\} is saved, but printing failed/);
  assert.match(page, /Retry A4/);
  assert.match(page, /Retry Thermal/);
  assert.match(page, /View saved invoice/);
  assert.doesNotMatch(page, /print blocked \*\//);
  assert.match(page, /onPrintSale=\{printExistingInvoice\}/);
});
