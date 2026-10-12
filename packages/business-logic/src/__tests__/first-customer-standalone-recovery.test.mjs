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
    taxConfig: { region: "IN" }, recycleBin: { items: [] },
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
