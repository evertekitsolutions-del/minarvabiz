import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText, filename,
);
const {
  composeManualCustomerDuesReminder,
  buildAuthorizedCustomerDuesReminder,
} = require("../customer-dues-reminder.ts");
const { setCurrentRole } = require("../permissions.ts");
const store = require("../store.ts");

const customer = (patch = {}) => ({
  id: "customer-1", name: "Acme <& Co", phone: "9876543210",
  whatsapp: null, outstandingBalance: 1500.25,
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  totalSpending: 1500.25, version: 1, ...patch,
});
const shop = { shopName: "Example Retail", currency: "INR", phone: "+91 9876543210" };

test("CRM-014 creates customer-specific, URL-encoded and reviewable unpaid balance reminder", () => {
  const reminder = composeManualCustomerDuesReminder(customer(), shop);
  assert.equal(reminder.customerId, "customer-1");
  assert.equal(reminder.outstandingBalance, 1500.25);
  assert.match(reminder.message, /Acme <& Co/);
  assert.match(reminder.message, /1,500\.25/);
  assert.match(reminder.message, /Example Retail/);
  assert.match(reminder.whatsappUrl, /^https:\/\/wa\.me\/919876543210\?text=/);
  assert.equal(new URL(reminder.whatsappUrl).searchParams.get("text"), reminder.message);
  assert.doesNotMatch(reminder.message, /automatically sent|overdue by|interest|late fee/i);
});

test("no due, missing contact, archived customer, invalid money and currency fail closed", () => {
  for (const balance of [0, -0.01, NaN, Infinity]) {
    assert.throws(() => composeManualCustomerDuesReminder(customer({outstandingBalance:balance}),shop));
  }
  assert.throws(() => composeManualCustomerDuesReminder(customer({phone:null,whatsapp:null}),shop), /WhatsApp number/);
  assert.throws(() => composeManualCustomerDuesReminder(customer({deletedAt:"2026-10-20"}),shop), /Archived/);
  assert.throws(() => composeManualCustomerDuesReminder(customer({name:"  "}),shop), /name is missing/);
  assert.throws(() => composeManualCustomerDuesReminder(customer(),{...shop,currency:"???"}), /currency/);
  const intlPhone = composeManualCustomerDuesReminder(customer({whatsapp:"+968 91234567"}),{...shop,currency:"OMR"});
  assert.match(intlPhone.whatsappUrl, /^https:\/\/wa\.me\/96891234567\?/);
  assert.match(intlPhone.message,/OMR/);
});

test("domain authorizes payments collectors and isolates customer branches", () => {
  const before = store.exportCoreState();
  try {
    store.hydrateCore({customers:[customer()]});
    setCurrentRole("tailor");
    assert.throws(() => buildAuthorizedCustomerDuesReminder("customer-1"), /Permission denied/);
    setCurrentRole("staff");
    assert.throws(() => buildAuthorizedCustomerDuesReminder("customer-1"), /Permission denied/);
    for (const role of ["cashier","manager","admin"]) {
      setCurrentRole(role);
      assert.equal(buildAuthorizedCustomerDuesReminder("customer-1").customerId,"customer-1");
    }
    store.hydrateCore({customers:[customer({branchId:"foreign-branch"})]});
    assert.throws(() => buildAuthorizedCustomerDuesReminder("customer-1"), /outside the active branch/);
    assert.throws(() => buildAuthorizedCustomerDuesReminder("unknown"), /not found/);
  } finally {
    setCurrentRole(null);
    store.hydrateCore(before);
  }
});

test("shared Web/Windows customer action reviews the message and never auto-sends", () => {
  const ui = fs.readFileSync(new URL("../../../ui/src/components/customers/CustomerList.tsx", import.meta.url), "utf8");
  assert.match(ui, /buildAuthorizedCustomerDuesReminder/);
  assert.match(ui, /can\("payments.collect"\)/);
  assert.match(ui, /Review reminder/);
  assert.match(ui, /Open WhatsApp composer/);
  assert.match(ui, /window\.open\(fresh\.whatsappUrl/);
  assert.doesNotMatch(ui, /queuePaymentReminder\(|enqueueOutbox\(/);
});
