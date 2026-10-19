import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename,
);
const { restoreEmptyLocalBrowserSnapshot, assertStandaloneEmptyWorkspaceRecovery, BROWSER_RECOVERY_STORAGE_KEY } =
  require("../browser-snapshot-recovery.ts");

const collections = [
  "customers", "products", "categories", "sales", "payments", "orders",
  "measurements", "laundry", "expenses", "purchases", "suppliers", "expenseCategories",
  "staff", "assignments", "incentiveRules", "payouts", "notifications",
  "returns", "audit", "stockTransfers", "heldSales", "attendance", "shiftRules",
  "rosterSlots", "holidayRules", "outbox", "quotations", "cashSessions",
  "purchaseReturns", "dayEndCloses",
];
function fixture() {
  return {
    version: 15, exportedAt: "2026-10-12T04:00:00.000Z",
    ...Object.fromEntries(collections.map(key => [key, []])),
    branches: [{ id: "branch-hq", name: "Main Branch" }],
    activeBranchId: "branch-hq",
    shopProfile: { shopName: "Minarva Biz", legalName: "", documentCode: "", gstin: "" },
    warehouse: { warehouses: [], locations: [], stock: [], transfers: [] },
    procurement: { purchaseOrders: [], goodsReceipts: [], purchaseInvoices: [] },
    accounting: { accounts: [], journals: [] },
    phase10: { productionWorkflows: [], materialRolls: [] },
    taxConfig: { enableGst: true, gstin: "", defaultRatePercent: 5,
      rates: [
        { id: "tax-0", name: "Exempt", ratePercent: 0, isDefault: false },
        { id: "tax-5", name: "GST 5%", ratePercent: 5, isDefault: true },
        { id: "tax-12", name: "GST 12%", ratePercent: 12, isDefault: false },
        { id: "tax-18", name: "GST 18%", ratePercent: 18, isDefault: false },
      ] }, recycleBin: { items: [] },
  };
}
const boundary = { cloudConfigured: false, nativeDesktop: false, authorized: true };
function storage(initial = null, fail = false) {
  let value = initial;
  return {
    getItem(key) { assert.equal(key, BROWSER_RECOVERY_STORAGE_KEY); return value; },
    setItem(key, next) { assert.equal(key, BROWSER_RECOVERY_STORAGE_KEY); if (fail) throw Error("quota"); value = next; },
    removeItem(key) { assert.equal(key, BROWSER_RECOVERY_STORAGE_KEY); value = null; },
  };
}

test("restores full v15 into empty standalone workspace and persists before hydration", () => {
  const old = JSON.stringify(fixture());
  const incoming = { ...fixture(), customers: [{ id: "c1" }] };
  const data = JSON.stringify(incoming);
  const local = storage(old);
  let applied = false;
  const result = restoreEmptyLocalBrowserSnapshot(local, data, old, boundary, json => {
    assert.equal(local.getItem(BROWSER_RECOVERY_STORAGE_KEY), json);
    applied = true;
    return { ok: true };
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(applied, true);
  assert.equal(local.getItem(BROWSER_RECOVERY_STORAGE_KEY), data);
});

test("fails closed before writing for cloud, desktop, missing permission, occupied or stale workspace", () => {
  const old = JSON.stringify(fixture());
  const source = JSON.stringify({ ...fixture(), sales: [{ id: "s" }] });
  for (const changed of [
    { cloudConfigured: true }, { nativeDesktop: true }, { authorized: false },
  ]) {
    const db = storage(old);
    const result = restoreEmptyLocalBrowserSnapshot(db, source, old, { ...boundary, ...changed }, () => {
      throw Error("must not hydrate");
    });
    assert.equal(result.ok, false);
    assert.equal(db.getItem(BROWSER_RECOVERY_STORAGE_KEY), old);
  }
  for (const changed of [
    { customers: [{ id: "existing" }] }, { shopProfile: { shopName: "Other Store" } },
    { branches: [{ id: "other-branch" }] }, { accounting: { journals: [{ id: "j1" }] } },
    { outbox: [{ status: "pending" }] },
  ]) {
    const current = JSON.stringify({ ...fixture(), ...changed });
    assert.throws(() => assertStandaloneEmptyWorkspaceRecovery(source, current, null, boundary));
    assert.throws(() => assertStandaloneEmptyWorkspaceRecovery(source, old, current, boundary));
  }
});


test("empty-of-transactions browser recovery protects existing first-run setup and restores nothing", () => {
  const pristine = fixture();
  const source = JSON.stringify({ ...fixture(), products: [{ id: "restored" }] });
  const saved = JSON.stringify(pristine);
  const cases = [
    { shopProfile: { ...pristine.shopProfile, phone: "+91 9999999999" } },
    { shopProfile: { ...pristine.shopProfile, address: "Already configured address" } },
    { shopProfile: { ...pristine.shopProfile, receiptFooter: "Custom receipt footer" } },
    { shopProfile: { ...pristine.shopProfile, currency: "OMR" } },
    { onboardingCompletedIds: ["shop"] },
    { taxConfig: { ...pristine.taxConfig, defaultRatePercent: 18 } },
    { taxConfig: { ...pristine.taxConfig, rates: [
      { id: "custom", name: "Custom", ratePercent: 8, isDefault: true },
    ] } },
    { printSettings: { defaultInvoicePaper: "thermal" } },
    { printSettings: { templates: [{ id: "custom-invoice" }] } },
    { autoBackup: { history: [{ id: "previous-backup" }] } },
    { autoBackup: { settings: { enabled: false } } },
  ];
  for (const change of cases) {
    const occupied = JSON.stringify({ ...pristine, ...change });
    const local = storage(occupied);
    let applied = false;
    const rejected = restoreEmptyLocalBrowserSnapshot(local, source, saved, boundary, () => {
      applied = true;
      return { ok: true };
    });
    assert.equal(rejected.ok, false, JSON.stringify(change));
    assert.equal(applied, false, "guard must run before any domain hydration");
    assert.equal(local.getItem(BROWSER_RECOVERY_STORAGE_KEY), occupied,
      "preexisting local snapshot must never be overwritten");
    assert.match(rejected.error, /configuration|onboarding/i);
    assert.throws(() =>
      assertStandaloneEmptyWorkspaceRecovery(source, saved, occupied, boundary),
      /configuration|onboarding/i,
      "persisted workspace must be protected even when in-memory view looks empty");
  }
});

test("untouched default setup is accepted regardless of setting key order and timestamps", () => {
  const current = fixture();
  current.shopProfile = {
    ...current.shopProfile,
    country: "India", currency: "INR", receiptFooter: "Thank you for your business!",
    phone: "", email: "", updatedAt: "2026-10-19T00:00:00.000Z",
  };
  current.printSettings = {
    templates: require("../print-templates.ts").defaultPrintTemplates()
      .map(template => Object.fromEntries(Object.entries(template).reverse())),
    silentDesktopPrint: false,
    defaultInvoicePaper: "a4", thermalWidthMm: 80,
    a4PrinterName: "", thermalPrinterName: "", labelPrinterName: "",
    labelWidthMm: 50, labelHeightMm: 30, labelCodeMode: "both",
    updatedAt: "2026-10-18T00:00:00.000Z",
  };
  current.autoBackup = {
    history: [], settings: {
      enabled: true, intervalHours: 24, retentionCount: 14,
      destinationPath: "", lastBackupAt: null, lastBackupPath: null, lastError: null,
    },
  };
  assert.doesNotThrow(() => assertStandaloneEmptyWorkspaceRecovery(
    JSON.stringify({ ...fixture(), customers: [{ id: "new" }] }),
    JSON.stringify(current), JSON.stringify(current), boundary,
  ));
});

test("rejects unsent restored events, incomplete archives and invalid JSON", () => {
  const old = JSON.stringify(fixture());
  for (const data of [
    { ...fixture(), outbox: [{ status: "pending" }] },
    { ...fixture(), outbox: [{ status: "failed" }] },
    { ...fixture(), version: 14 },
    { ...fixture(), accounting: undefined },
    { ...fixture(), customers: undefined },
  ]) assert.throws(() => assertStandaloneEmptyWorkspaceRecovery(JSON.stringify(data), old, null, boundary));
  assert.throws(() => assertStandaloneEmptyWorkspaceRecovery("{oops", old, null, boundary));
});

test("failed import or storage quota restores previously cached empty state", () => {
  const old = JSON.stringify(fixture());
  const source = JSON.stringify({ ...fixture(), products: [{ id: "p1" }] });
  const local = storage(old);
  const fail = restoreEmptyLocalBrowserSnapshot(local, source, old, boundary, () => ({ ok: false, error: "import rejected" }));
  assert.equal(fail.ok, false);
  assert.equal(local.getItem(BROWSER_RECOVERY_STORAGE_KEY), old);
  const quota = restoreEmptyLocalBrowserSnapshot(storage(old, true), source, old, boundary, () => {
    throw Error("should not import");
  });
  assert.equal(quota.ok, false);
  assert.match(quota.error, /persist/i);
});

test("Web recovery is gated and never sends the snapshot to Supabase", () => {
  const page = fs.readFileSync("apps/web/src/app/(app)/backup/page.tsx", "utf8");
  assert.match(page, /restoreEmptyLocalBrowserSnapshot\(/);
  assert.match(page, /isSupabaseConfigured\(\) \|\| desktop/);
  assert.match(page, /can\("backup\.manage"\)/);
  assert.match(page, /importDomainSnapshotJson/);
  assert.doesNotMatch(page, /supabase\.from\(|\.upsert\(/);
  const layout = fs.readFileSync("apps/web/src/components/AppLayoutClient.tsx", "utf8");
  assert.match(layout, /if \(!isSupabaseConfigured\(\)\) bootstrapFromLocalStorage\(\)/);
});
