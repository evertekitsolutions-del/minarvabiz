import assert from "node:assert/strict";
import { register } from "node:module";

register(new URL("../../../../scripts/ts-source-test-loader.mjs", import.meta.url));

const printSettings = await import(new URL("../print-settings.ts", import.meta.url));
const desktopPrint = await import(new URL("../desktop-print.ts", import.meta.url));
const barcode = await import(new URL("../barcode-labels.ts", import.meta.url));
const invoice = await import(new URL("../invoice.ts", import.meta.url));
const receipt = await import(new URL("../receipt.ts", import.meta.url));

printSettings.hydratePrintSettings({
  defaultInvoicePaper: "thermal",
  thermalWidthMm: 58,
  a4PrinterName: "Office A4",
  thermalPrinterName: "Receipt 58",
  labelPrinterName: "Label 50x30",
  labelWidthMm: 50,
  labelHeightMm: 30,
  silentDesktopPrint: true,
  updatedAt: new Date().toISOString(),
});

let settings = printSettings.getPrintSettings();
assert.equal(settings.thermalWidthMm, 58);
assert.equal(settings.labelPrinterName, "Label 50x30");
assert.equal(settings.labelWidthMm, 50);
assert.equal(settings.labelHeightMm, 30);

settings = printSettings.updatePrintSettings({ labelWidthMm: 500, labelHeightMm: 1 });
assert.equal(settings.labelWidthMm, 120);
assert.equal(settings.labelHeightMm, 15);
settings = printSettings.updatePrintSettings({ labelWidthMm: 50, labelHeightMm: 30 });

const calls = [];
globalThis.window = {
  minarvaDesktop: {
    printHtml: async (input) => {
      calls.push(input);
      return { ok: true };
    },
  },
  open: () => {
    throw new Error("desktop native printing must not fall back to window.open");
  },
};

const manualHtml = "<html><body>native print</body></html>";
assert.equal(desktopPrint.tryDesktopPrintHtml(manualHtml, "a4"), true);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(calls.at(-1).paper, "a4");
assert.equal(calls.at(-1).deviceName, "Office A4");
assert.equal(calls.at(-1).silent, true);

const generated = barcode.generateProductBarcode([]);
assert.equal(generated.length, 13);
assert.equal(barcode.isValidEan13(generated), true);
assert.equal(barcode.ean13CheckDigit(generated.slice(0, 12)), Number(generated[12]));

const product = {
  id: "product-1",
  name: "Printed Kurti",
  sku: "KURTI-001",
  barcode: generated,
  categoryId: null,
  brand: "Minarva",
  size: "M",
  color: "Blue",
  fabric: "Cotton",
  parentProductId: null,
  hasVariants: false,
  unit: "pcs",
  costPrice: 500,
  sellingPrice: 799,
  discount: 0,
  taxRate: 5,
  stockQuantity: 10,
  minimumStock: 2,
  supplierId: null,
  imageUrl: null,
  notes: null,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deletedAt: null,
  branchId: null,
  version: 1,
};

const labelHtml = barcode.buildBarcodeLabelHtml(product, {
  copies: 2,
  categoryName: "Readymade",
  autoPrint: false,
  labelWidthMm: 50,
  labelHeightMm: 30,
});
assert.match(labelHtml, /Printed Kurti/);
assert.match(labelHtml, /width:50mm/);
assert.match(labelHtml, /height:30mm/);
assert.doesNotMatch(labelHtml, /window\.print/);

barcode.printBarcodeLabels(product, 2, "Readymade");
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(calls.at(-1).paper, "label");
assert.equal(calls.at(-1).deviceName, "Label 50x30");
assert.equal(calls.at(-1).labelWidthMm, 50);
assert.equal(calls.at(-1).labelHeightMm, 30);

const now = new Date().toISOString();
const sale = {
  id: "sale-1",
  invoiceNumber: "INV-1001",
  customerId: null,
  customerName: "Test Customer",
  saleDate: now,
  subtotal: 1000,
  discountAmount: 50,
  taxAmount: 47.5,
  total: 997.5,
  paidAmount: 997.5,
  balanceAmount: 0,
  status: "completed",
  notes: null,
  items: [{
    id: "item-1",
    saleId: "sale-1",
    productId: "product-1",
    productName: "Printed Kurti",
    sku: "KURTI-001",
    quantity: 1,
    unitPrice: 1000,
    costPrice: 500,
    discountPercent: 5,
    taxRate: 5,
    lineTotal: 997.5,
  }],
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  branchId: null,
  deviceId: null,
  createdBy: null,
  version: 1,
};

const invoiceHtml = invoice.buildSaleInvoiceHtml(sale, { paper: "thermal", autoPrint: false });
assert.match(invoiceHtml, /INV-1001/);
assert.doesNotMatch(invoiceHtml, /window\.print/);
invoice.printSaleInvoice(sale, "thermal");
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(calls.at(-1).paper, "thermal");
assert.equal(calls.at(-1).deviceName, "Receipt 58");

const receiptHtml = receipt.buildSaleReceiptHtml(sale, { autoPrint: false });
assert.match(receiptHtml, /INV-1001/);
assert.doesNotMatch(receiptHtml, /window\.print/);
receipt.printSaleReceipt(sale);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(calls.at(-1).paper, "thermal");

delete globalThis.window;
assert.equal(desktopPrint.tryDesktopPrintHtml(manualHtml, "a4"), false);

console.log("Native desktop printing runtime tests passed");
