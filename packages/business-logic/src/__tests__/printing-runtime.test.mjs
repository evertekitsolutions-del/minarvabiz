import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildBarcodeLabelHtml,
  ean13CheckDigit,
  isValidEan13,
  printBarcodeLabels,
} from "../barcode-labels.ts";
import { tryDesktopPrintHtml } from "../desktop-print.ts";
import { buildSaleInvoiceHtml, printSaleInvoice } from "../invoice.ts";
import {
  getPrintSettings,
  hydratePrintSettings,
  updatePrintSettings,
} from "../print-settings.ts";
import {
  buildOrderReceiptHtml,
  buildSaleReceiptHtml,
  printOrderReceipt,
  printSaleReceipt,
} from "../receipt.ts";

const iso = "2026-09-25T12:00:00.000Z";

const product = {
  id: "p1",
  name: "Blue Kurti",
  sku: "KURTI-BLUE-M",
  barcode: "",
  categoryId: null,
  brand: "Minarva",
  size: "M",
  color: "Blue",
  fabric: "Cotton",
  parentProductId: null,
  hasVariants: false,
  unit: "pcs",
  costPrice: 500,
  sellingPrice: 899,
  discount: 0,
  taxRate: 5,
  stockQuantity: 10,
  minimumStock: 2,
  supplierId: null,
  imageUrl: null,
  notes: null,
  isActive: true,
  createdAt: iso,
  updatedAt: iso,
  deletedAt: null,
  branchId: null,
  version: 1,
};

const sale = {
  id: "s1",
  invoiceNumber: "INV-1001",
  customerId: null,
  customerName: "Walk-in",
  saleDate: iso,
  subtotal: 899,
  discountAmount: 0,
  taxAmount: 0,
  total: 899,
  paidAmount: 899,
  balanceAmount: 0,
  status: "completed",
  notes: null,
  items: [{
    id: "si1",
    saleId: "s1",
    productId: "p1",
    productName: "Blue Kurti",
    sku: "KURTI-BLUE-M",
    quantity: 1,
    unitPrice: 899,
    costPrice: 500,
    discountPercent: 0,
    taxRate: 0,
    lineTotal: 899,
  }],
  createdAt: iso,
  updatedAt: iso,
  deletedAt: null,
  branchId: null,
  deviceId: null,
  createdBy: null,
  version: 1,
};

const order = {
  id: "o1",
  orderNumber: "ORD-1001",
  customerId: "c1",
  customerName: "Customer",
  orderDate: iso,
  deliveryDate: iso,
  serviceType: "ladies_tailoring",
  status: "pending",
  assignedStaffId: null,
  assignedTailorId: null,
  measurements: null,
  measurementProfileId: null,
  notes: "Test",
  materialDetails: null,
  customerSuppliedMaterial: true,
  shopSuppliedMaterial: false,
  price: 1200,
  discount: 100,
  advance: 500,
  balance: 600,
  externalMaterialCost: 0,
  orderExpensesTotal: 0,
  quantity: 1,
  unitPrice: 1200,
  tshirtDetails: null,
  createdAt: iso,
  updatedAt: iso,
  deletedAt: null,
  branchId: null,
  deviceId: null,
  createdBy: null,
  version: 1,
};

test("print settings clamp and hydrate label configuration", () => {
  delete globalThis.window;
  const clamped = updatePrintSettings({ labelWidthMm: 999, labelHeightMm: 1 });
  assert.equal(clamped.labelWidthMm, 120);
  assert.equal(clamped.labelHeightMm, 15);

  hydratePrintSettings({
    defaultInvoicePaper: "thermal",
    thermalWidthMm: 58,
    a4PrinterName: "A4 Printer",
    thermalPrinterName: "Thermal Printer",
    labelPrinterName: "Label Printer",
    labelWidthMm: 50,
    labelHeightMm: 30,
    silentDesktopPrint: true,
    updatedAt: iso,
  });
  const settings = getPrintSettings();
  assert.equal(settings.labelPrinterName, "Label Printer");
  assert.equal(settings.labelWidthMm, 50);
  assert.equal(settings.labelHeightMm, 30);
  assert.equal(settings.thermalWidthMm, 58);
});

test("invoice, receipt and barcode builders produce printable HTML", () => {
  const body = "290000000000";
  const barcode = body + ean13CheckDigit(body);
  assert.equal(isValidEan13(barcode), true);

  const labelHtml = buildBarcodeLabelHtml({ ...product, barcode }, {
    copies: 2,
    categoryName: "Readymade",
    autoPrint: false,
    labelWidthMm: 50,
    labelHeightMm: 30,
  });
  assert.match(labelHtml, /width:50mm/);
  assert.match(labelHtml, /height:30mm/);
  assert.match(labelHtml, /EAN-13/);
  assert.doesNotMatch(labelHtml, /window\.print/);

  const invoiceHtml = buildSaleInvoiceHtml(sale, { paper: "thermal", autoPrint: false });
  assert.match(invoiceHtml, /INV-1001/);
  assert.doesNotMatch(invoiceHtml, /window\.print/);

  const receiptHtml = buildSaleReceiptHtml(sale, { autoPrint: false });
  assert.match(receiptHtml, /INV-1001/);
  assert.doesNotMatch(receiptHtml, /window\.print/);

  const orderHtml = buildOrderReceiptHtml(order, { autoPrint: false });
  assert.match(orderHtml, /ORD-1001/);
  assert.doesNotMatch(orderHtml, /window\.print/);
});

test("desktop native bridge receives bill, receipt and label print jobs", async () => {
  hydratePrintSettings({
    defaultInvoicePaper: "a4",
    thermalWidthMm: 80,
    a4PrinterName: "A4 Printer",
    thermalPrinterName: "Thermal Printer",
    labelPrinterName: "Label Printer",
    labelWidthMm: 50,
    labelHeightMm: 30,
    silentDesktopPrint: true,
    updatedAt: iso,
  });

  const jobs = [];
  globalThis.window = {
    minarvaDesktop: {
      printHtml: async (input) => {
        jobs.push(input);
        return { ok: true };
      },
    },
  };

  assert.equal(tryDesktopPrintHtml("<html>direct</html>", "label", { labelWidthMm: 50, labelHeightMm: 30 }), true);
  printSaleInvoice(sale, "a4");
  printSaleReceipt(sale);
  printOrderReceipt(order);

  const body = "290000000000";
  const barcode = body + ean13CheckDigit(body);
  printBarcodeLabels({ ...product, barcode }, 1, "Readymade");

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(jobs.length, 5);
  assert.equal(jobs[0].paper, "label");
  assert.equal(jobs[0].deviceName, "Label Printer");
  assert.equal(jobs[0].silent, true);
  assert.equal(jobs[1].paper, "a4");
  assert.equal(jobs[1].deviceName, "A4 Printer");
  assert.equal(jobs[4].paper, "label");
  assert.equal(jobs[4].labelWidthMm, 50);
  assert.equal(jobs[4].labelHeightMm, 30);

  delete globalThis.window;
});
