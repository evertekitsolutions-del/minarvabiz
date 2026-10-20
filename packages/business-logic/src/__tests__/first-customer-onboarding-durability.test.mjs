import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (m, filename) => m._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  filename
);
const onboarding = require("../onboarding.ts");
const browser = require("../onboarding-browser-preferences.ts");
const source = fs.readFileSync("packages/business-logic/src/persistence.ts", "utf8");
const page = fs.readFileSync("apps/web/src/app/(app)/onboarding/page.tsx", "utf8");
const customerPage = fs.readFileSync("apps/web/src/app/(app)/customers/page.tsx", "utf8");
const desktopCustomerPanel = fs.readFileSync("apps/desktop/src/components/DesktopCustomerMasterPanel.tsx", "utf8");
const customerList = fs.readFileSync("packages/ui/src/components/customers/CustomerList.tsx", "utf8");

function memoryStorage() {
  const data = new Map();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    data,
  };
}

test("operator confirmations survive a simulated restart and are reversible", () => {
  onboarding.hydrateOnboarding([]);
  assert.equal(onboarding.isOnboardingComplete(), false);
  const ids = onboarding.getOnboardingSteps().map(step => step.id);
  assert.deepEqual(ids, ["shop", "products", "customers", "customer-balances", "suppliers", "license", "backup"]);
  assert.equal(onboarding.markOnboardingDone("shop"), true);
  assert.equal(onboarding.markOnboardingDone("backup"), true);
  assert.equal(onboarding.markOnboardingDone("made-up"), false);
  assert.deepEqual(onboarding.exportOnboardingIds(), ["shop", "backup"]);
  onboarding.hydrateOnboarding([]);
  assert.deepEqual(onboarding.exportOnboardingIds(), []);
  onboarding.hydrateOnboarding(["backup", "shop"]);
  assert.deepEqual(onboarding.exportOnboardingIds(), ["shop", "backup"]);
  assert.equal(onboarding.unmarkOnboardingDone("shop"), true);
  assert.deepEqual(onboarding.exportOnboardingIds(), ["backup"]);
  for (const id of ids) onboarding.markOnboardingDone(id);
  assert.equal(onboarding.isOnboardingComplete(), true);
  onboarding.hydrateOnboarding([]);
  assert.equal(onboarding.isOnboardingComplete(), false);
});

test("invalid imported checklist is rejected before it can claim success", () => {
  for (const invalid of [null, undefined, "", 42, {}, ["shop", "shop"],
    ["shop", "unknown"], ["__proto__"], Array(200).fill("backup")]) {
    assert.throws(() => onboarding.validateOnboardingIds(invalid), /Onboarding confirmations/);
  }
  assert.deepEqual(onboarding.validateOnboardingIds([]), []);
  assert.deepEqual(onboarding.validateOnboardingIds(["license", "customers"]), ["customers", "license"]);
});

test("production web confirmations are user+branch scoped, not shared on browser login", () => {
  const storage = memoryStorage();
  const user1 = browser.onboardingPreferenceKey("user-one", "branch-hq");
  const user2 = browser.onboardingPreferenceKey("user-two", "branch-hq");
  const branch2 = browser.onboardingPreferenceKey("user-one", "branch-east");
  assert.ok(user1 && user2 && branch2);
  assert.notEqual(user1, user2);
  assert.notEqual(user1, branch2);
  assert.equal(browser.onboardingPreferenceKey(null, "branch-hq"), null);
  assert.equal(browser.onboardingPreferenceKey("user-one", null), null);
  assert.equal(browser.onboardingPreferenceKey("bad/user", "branch-hq"), null);
  browser.writeOnboardingPreferences(storage, user1, ["backup", "shop"]);
  assert.deepEqual(browser.readOnboardingPreferences(storage, user1), ["shop", "backup"]);
  assert.deepEqual(browser.readOnboardingPreferences(storage, user2), []);
  assert.deepEqual(browser.readOnboardingPreferences(storage, branch2), []);
  assert.deepEqual(browser.readOnboardingPreferences(storage,
    browser.onboardingPreferenceKey(null, null, true)), []);
});

test("invalid/corrupted/unwritable browser state fails closed", () => {
  const storage = memoryStorage(), key = browser.onboardingPreferenceKey("test", "branch-hq");
  storage.setItem(key, "not JSON");
  assert.throws(() => browser.readOnboardingPreferences(storage, key));
  storage.setItem(key, JSON.stringify({ version: 7, ids: ["shop"] }));
  assert.throws(() => browser.readOnboardingPreferences(storage, key), /Unsupported/);
  storage.setItem(key, JSON.stringify({ version: 1, ids: ["unknown"] }));
  assert.throws(() => browser.readOnboardingPreferences(storage, key), /unknown/);
  storage.setItem(key, "x".repeat(999));
  assert.throws(() => browser.readOnboardingPreferences(storage, key), /oversized/);
  const noWrites = { getItem: () => null, setItem: () => { throw Error("quota exceeded"); } };
  assert.throws(() => browser.writeOnboardingPreferences(noWrites, key, ["shop"]), /quota exceeded/);
  assert.throws(() => browser.writeOnboardingPreferences(storage, key, ["shop","shop"]), /duplicate/);
});

test("v15/legacy import, backup and rollback integrate confirmed steps without schema downgrade", () => {
  assert.match(source, /onboardingCompletedIds\?: string\[\]/);
  assert.match(source, /onboardingCompletedIds: onboarding\.exportOnboardingIds\(\)/);
  assert.match(source, /onboardingCompletedIds: onboarding\.validateOnboardingIds\(input\.onboardingCompletedIds \?\? \[\]\)/);
  assert.match(source, /onboarding\.hydrateOnboarding\(snap\.onboardingCompletedIds \?\? \[\]\)/);
  assert.match(source, /export const SNAPSHOT_VERSION = 15;/);
  assert.match(source, /const rollback = exportDomainSnapshotFull\(\)/);
  assert.match(page, /readOnboardingPreferences\(window\.localStorage, scope\)/);
  assert.match(page, /writeOnboardingPreferences\(window\.localStorage, scopeKey,/);
  assert.match(page, /window\.addEventListener\("storage", onStorage\)/);
  assert.match(page, /Confirmed by you/);
  assert.doesNotMatch(page, /Mark done/);
});

test("opening customer balances are permission-gated in Web and Windows UI and use the shared ledger posting", () => {
  assert.match(customerList, /onSetOpeningBalance/);
  assert.match(customerPage, /can\(\"settings\.manage\"\)/);
  assert.match(customerPage, /setOpeningCustomerBalance/);
  assert.match(customerPage, /Opening Balance Equity/);
  assert.match(desktopCustomerPanel, /can\(\"settings\.manage\"\)/);
  assert.match(desktopCustomerPanel, /setOpeningCustomerBalance/);
  assert.match(desktopCustomerPanel, /Opening Balance Equity/);
});

test("opening balance modal snapshots the customer and refuses stale outstanding totals", () => {
  for (const source of [customerPage, desktopCustomerPanel]) {
    assert.match(source, /setOpeningBalanceTarget\(\{ \.\.\.customer \}\)/);
    assert.match(source, /openedCents !== liveCents/);
    assert.match(source, /Customer balance changed\. Close and reopen/);
    assert.match(source, /setOpeningCustomerBalance\(liveCustomer\.id, Number\(openingBalanceAmount\)\)/);
  }
});

test("first-customer supplier payable correction is permission-gated and ledger-backed in Web and Windows", () => {
  const supplierList = fs.readFileSync("packages/ui/src/components/suppliers/SupplierList.tsx", "utf8");
  const webSupplier = fs.readFileSync("apps/web/src/app/(app)/suppliers/page.tsx", "utf8");
  const desktopSupplier = fs.readFileSync("apps/desktop/src/components/DesktopSupplierOpeningBalancePanel.tsx", "utf8");
  const desktopApp = fs.readFileSync("apps/desktop/src/App.tsx", "utf8");
  const accounting = fs.readFileSync("packages/business-logic/src/opening-balances.ts", "utf8");
  assert.match(supplierList, /onSetOpeningBalance/);
  assert.match(webSupplier, /onSetOpeningBalance=\{can\("settings\.manage"\) \? openOpeningBalance : undefined\}/);
  assert.match(desktopSupplier, /onSetOpeningBalance=\{can\("settings\.manage"\) \? openOpeningBalance : undefined\}/);
  assert.match(desktopApp, /<DesktopSupplierOpeningBalancePanel onPersist=\{persistAndRefresh\}/);
  for (const source of [webSupplier, desktopSupplier]) {
    assert.match(source, /setOpeningBalanceTarget\(\{ \.\.\.supplier \}\)/);
    assert.match(source, /openedCents !== liveCents/);
    assert.match(source, /Supplier payable changed\. Close and reopen/);
    assert.match(source, /phase5Store\.getSupplier\(openingBalanceTarget\.id\)/);
    assert.match(source, /setOpeningSupplierBalance\(liveSupplier\.id, Number\(openingBalanceAmount\)\)/);
    assert.match(source, /Accounts Payable and Opening Balance Equity/);
    assert.match(source, /This is not a supplier payment/);
  }
  assert.match(accounting, /assertPermission\("settings\.manage"\)/);
  assert.match(accounting, /referenceType: "auto_opening_supplier"/);
  assert.match(accounting, /auditAction\("opening\.supplier_balance"/);
});

test("Windows supplier setup refuses malformed amounts rather than posting a silent zero", () => {
  const app = fs.readFileSync("apps/desktop/src/App.tsx", "utf8");
  const start = app.indexOf("  function handleCreateSupplier()");
  const end = app.indexOf("\n  function handleSaveProduct()", start);
  assert.ok(start > 0 && end > start, "desktop create supplier handler present");
  const handler = app.slice(start, end);
  assert.match(handler, /openingBalance:Number\(supplierForm\.openingBalance\)/);
  assert.doesNotMatch(handler, /Number\(supplierForm\.openingBalance\)\s*\|\|\s*0/);
  function submit(raw) {
    const created = [], errors = [];
    const supplierForm = {
      name: "Supplier A", company: "", phone: "", email: "", address: "",
      category: "materials", openingBalance: raw, notes: "",
    };
    const phase5Store = {
      createSupplier(input) {
        // Mimics existing domain moneyMinorOrNull guard and opening posting.
        const minor = Math.round(input.openingBalance * 100);
        if (!Number.isFinite(input.openingBalance) ||
            input.openingBalance < 0 ||
            !Number.isSafeInteger(minor) ||
            Math.abs(input.openingBalance * 100 - minor) > 0.000001) {
          throw Error("Opening supplier balance must be a finite non-negative amount");
        }
        created.push(input);
        return { id: "s1" };
      },
    };
    const bindings = {
      supplierForm, phase5Store,
      setPurchaseForm: () => {}, setProductForm: () => {},
      setSupplierForm: () => {}, setSupplierOpen: () => {},
      setModuleError: error => errors.push(error),
      persistAndRefresh: () => {}, errorMessage: error => error.message,
    };
    const make = new Function(...Object.keys(bindings),
      handler + "\nreturn handleCreateSupplier;");
    make(...Object.values(bindings))();
    return { created, errors };
  }
  for (const raw of ["not a number", "NaN", "Infinity", "12.345", "-1"]) {
    const outcome = submit(raw);
    assert.deepEqual(outcome.created, [], raw + " must not create an unbalanced payable");
    assert.match(outcome.errors[0], /Opening supplier balance/, raw);
  }
  assert.equal(submit("").created[0].openingBalance, 0);
  assert.equal(submit("125.50").created[0].openingBalance, 125.5);
});
