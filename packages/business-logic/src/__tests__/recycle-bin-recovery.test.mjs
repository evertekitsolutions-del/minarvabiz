import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const permissions = require("../permissions.ts");
const store = require("../store.ts");
const phase5 = require("../phase5-store.ts");
const phase6 = require("../phase6-store.ts");
const quotations = require("../quotations.ts");
const recycle = require("../recycle-bin.ts");
const persistence = require("../persistence.ts");

permissions.setCurrentRole("admin");
permissions.setRuntimeFeaturePolicy(null);

const deletedAt = "2026-09-01T00:00:00.000Z";

store.hydrateCore({
  categories: [],
  customers: [{
    id: "trash-customer", name: "Recoverable Customer", phone: "9999999999", email: null, address: null,
    outstandingBalance: 0, totalSpending: 0, createdAt: deletedAt, updatedAt: deletedAt, deletedAt, version: 2,
  }],
  products: [{
    id: "trash-product", name: "Recoverable Product", sku: "TR-1", barcode: null, categoryId: null,
    unit: "pcs", costPrice: 10, sellingPrice: 20, stockQuantity: 0, minimumStock: 0, isActive: false,
    createdAt: deletedAt, updatedAt: deletedAt, deletedAt, version: 2,
  }],
  sales: [],
  payments: [],
});
phase5.hydratePhase5({
  suppliers: [{
    id: "trash-supplier", name: "Recoverable Supplier", company: null, phone: null, email: null, address: null,
    outstandingBalance: 0, totalPurchases: 0, createdAt: deletedAt, updatedAt: deletedAt, deletedAt,
  }],
  laundryOrders: [], expenses: [], purchases: [], expenseCategories: [],
});
phase6.hydratePhase6({
  staff: [{
    id: "trash-staff", name: "Recoverable Staff", role: "staff", salary: 0, status: "inactive",
    createdAt: deletedAt, updatedAt: deletedAt, deletedAt,
  }],
  assignments: [], incentiveRules: [], payouts: [], notifications: [],
});
quotations.hydrateQuotations({
  quotations: [{
    id: "trash-quotation", quotationNumber: "QT-TRASH-001", customerId: "trash-customer",
    customerName: "Recoverable Customer", status: "draft", lines: [],
    materialCharges: 0, labourCharges: 0, subtotal: 0, discount: 0, tax: 0, total: 0, advance: 0, balance: 0,
    validUntil: null, notes: null, convertedSaleId: null, convertedOrderId: null,
    createdAt: deletedAt, updatedAt: deletedAt, deletedAt, version: 2,
  }],
});

recycle.hydrateRecycleBinState({ retentionDays: 30 });
const initial = recycle.listRecycleBinItems();
assert.equal(initial.length, 5);
assert.deepEqual(new Set(initial.map((item) => item.entityType)), new Set(["customer", "product", "supplier", "staff", "quotation"]));

const snapshot = persistence.exportDomainSnapshot();
assert.equal(snapshot.customers.some((row) => row.id === "trash-customer" && row.deletedAt), true);
assert.equal(snapshot.products.some((row) => row.id === "trash-product" && row.deletedAt), true);
assert.equal(snapshot.suppliers.some((row) => row.id === "trash-supplier" && row.deletedAt), true);
assert.equal(snapshot.staff.some((row) => row.id === "trash-staff" && row.deletedAt), true);
assert.equal(snapshot.quotations.some((row) => row.id === "trash-quotation" && row.deletedAt), true);
assert.equal(snapshot.recycleBin.retentionDays, 30);

assert.equal(recycle.restoreRecycleBinItem("customer", "trash-customer").ok, true);
assert.equal(store.getCustomer("trash-customer")?.name, "Recoverable Customer");
assert.equal(recycle.listRecycleBinItems().length, 4);

assert.equal(recycle.permanentlyDeleteRecycleBinItem("product", "trash-product").ok, true);
assert.equal(store.listArchivedProducts().length, 0);

const purged = recycle.purgeExpiredRecycleBinItems(new Date("2026-10-15T00:00:00.000Z"));
assert.equal(purged.errors.length, 0);
assert.equal(purged.purged, 3);
assert.equal(recycle.listRecycleBinItems().length, 0);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const ui = fs.readFileSync(path.join(root, "packages/ui/src/components/settings/TrashRecoveryPanel.tsx"), "utf8");
assert.match(ui, /Trash & Recovery/);
assert.match(ui, /Auto-delete after \(days\)/);
assert.match(ui, />Restore</);
assert.match(ui, />Delete permanently</);
assert.match(ui, /posted invoices and other financial\/audit records/i);

console.log("Recycle bin recovery and retention PASS");
