import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const databaseRequire = createRequire(new URL("../../../database/package.json", import.meta.url));
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename,
);
const logic = require("../recurring-invoice.ts");
const sqlite = require("../recurring-invoice-sqlite-pilot.ts");
const initSqlJs = databaseRequire("sql.js/dist/sql-asm.js");
const SQL = await initSqlJs();

const scope = { organizationId: "org-1", companyId: "company-1", branchId: "branch-1" };
const authorize = (org, company, branch) => {
  if (org !== scope.organizationId || company !== scope.companyId || branch !== scope.branchId) {
    throw new Error("tenant branch denied");
  }
};
const rule = (patch = {}) => ({
  ...scope, id: "monthly-maintenance", customerId: "customer-1",
  sourceSaleId: "issued-invoice-1", currency: "INR",
  firstDueDate: "2026-01-31", frequency: "monthly",
  interval: 1, maxOccurrences: 12,
  lines: [{ productId: "annual-service", quantityMilli: 1000 }],
  notes: "Price and tax must be reconfirmed before invoice creation", ...patch,
});
function memoryDb() {
  const raw = new SQL.Database();
  const db = {
    exec(sql, params = []) { raw.run(sql, params); },
    query(sql, params = []) {
      const stmt = raw.prepare(sql);
      try {
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        return rows;
      } finally { stmt.free(); }
    },
    transaction(fn) {
      raw.run("BEGIN IMMEDIATE");
      try {
        const result = fn();
        raw.run("COMMIT");
        return result;
      } catch (error) {
        raw.run("ROLLBACK");
        throw error;
      }
    },
  };
  sqlite.initializeRecurringInvoicePilotSqlite(db);
  return db;
}
const readRows = (db) => db.query("SELECT * FROM recurring_invoice_draft_pilot_v1 ORDER BY sequence");

test("31st monthly recurrence clamps Feb but restores anchor day in March", () => {
  const input = rule();
  const schedule = logic.createRecurringInvoiceSchedule(input);
  assert.deepEqual(
    logic.planRecurringInvoiceDue(schedule, "2026-04-30", []).map(x => x.dueDate),
    ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"],
  );
  assert.equal(logic.recurringInvoiceDueDate(schedule, 5), "2026-05-31");
  assert.equal(JSON.stringify(input), JSON.stringify(rule()), "planner must not mutate input");
  assert.equal(schedule.version, 1);
  assert.equal(schedule.status, "active");
});

test("weekly intervals, leap days, finite count and explicit end date", () => {
  const weekly = logic.createRecurringInvoiceSchedule(rule({
    firstDueDate: "2026-02-23", frequency: "weekly", interval: 2,
    maxOccurrences: 3, endDate: "2026-04-01",
  }));
  assert.deepEqual(logic.planRecurringInvoiceDue(weekly, "2027-01-01", []).map(x => x.dueDate),
    ["2026-02-23", "2026-03-09", "2026-03-23"]);
  const leap = logic.createRecurringInvoiceSchedule(rule({
    firstDueDate: "2028-01-31", maxOccurrences: 3,
  }));
  assert.deepEqual(logic.planRecurringInvoiceDue(leap, "2028-03-31", []).map(x => x.dueDate),
    ["2028-01-31", "2028-02-29", "2028-03-31"]);
});

test("replay/cursor never duplicates an occurrence, with stable scoped identity", () => {
  const schedule = logic.createRecurringInvoiceSchedule(rule());
  const due = logic.planRecurringInvoiceDue(schedule, "2026-04-30", [1, 2], 1);
  assert.equal(due.length, 1);
  assert.deepEqual([due[0].id, due[0].sequence, due[0].kind],
    ["monthly-maintenance:3", 3, "invoice_draft_pending_review"]);
  assert.deepEqual(logic.planRecurringInvoiceDue(schedule, "2026-02-01", [1]), []);
  assert.throws(() => logic.planRecurringInvoiceDue(schedule, "2026-04-30", [1, 1]), /duplicate/);
  assert.throws(() => logic.planRecurringInvoiceDue(schedule, "2026-04-30", [0]), /Invalid/);
  assert.throws(() => logic.planRecurringInvoiceDue(schedule, "2026-04-30", [], 101), /limit/);
});

test("bad calendar, scope, quantity, currencies, bounds and fields fail closed", () => {
  for (const invalid of [
    { firstDueDate: "2026-02-30" },
    { endDate: "2025-12-31" },
    { firstDueDate: "2026-1-31" },
    { interval: 0 }, { interval: 13 }, { maxOccurrences: 121 },
    { organizationId: " " }, { branchId: "another\nbranch" },
    { currency: "₹" }, { frequency: "daily" },
    { lines: [] }, { lines: [{ productId: "product", quantityMilli: 0 }] },
    { lines: [{ productId: "product", quantityMilli: 1000, amount: 15 }] },
    { notes: "x".repeat(1001) },
  ]) {
    assert.throws(() => logic.createRecurringInvoiceSchedule(rule(invalid)), undefined,
      JSON.stringify(invalid).slice(0, 100));
  }
  const schedule = logic.createRecurringInvoiceSchedule(rule());
  assert.throws(() => logic.recurringInvoiceDueDate(schedule, 0), /bounds/);
  assert.throws(() => logic.planRecurringInvoiceDue(schedule, "2026-02-30", []), /Invalid/);
});

test("pause and cancellation stop new draft planning; terminal cancellation and CAS", () => {
  const original = logic.createRecurringInvoiceSchedule(rule());
  const paused = logic.changeRecurringInvoiceStatus(original, 1, "paused");
  assert.equal(paused.version, 2);
  assert.deepEqual(logic.planRecurringInvoiceDue(paused, "2026-12-31", []), []);
  assert.throws(() => logic.changeRecurringInvoiceStatus(paused, 1, "active"), /revision/);
  const resumed = logic.changeRecurringInvoiceStatus(paused, 2, "active");
  assert.equal(logic.planRecurringInvoiceDue(resumed, "2026-01-31", []).length, 1);
  const cancelled = logic.changeRecurringInvoiceStatus(resumed, 3, "cancelled");
  assert.deepEqual(logic.planRecurringInvoiceDue(cancelled, "2026-12-31", []), []);
  assert.throws(() => logic.changeRecurringInvoiceStatus(cancelled, 4, "active"), /cannot be reactivated/);
});

test("real SQLite staging is durable, scoped, ordered and idempotent across retries", () => {
  const db = memoryDb();
  const created = sqlite.saveRecurringInvoicePilotSqlite(db, rule(), authorize);
  assert.equal(created.disposition, "created");
  assert.equal(sqlite.saveRecurringInvoicePilotSqlite(db, rule(), authorize).disposition, "existing");
  const first = sqlite.stageRecurringInvoiceDraftsPilotSqlite(
    db, scope, "monthly-maintenance", "2026-03-31", authorize);
  assert.deepEqual(first.map(x => x.sequence), [1, 2, 3]);
  assert.deepEqual(sqlite.stageRecurringInvoiceDraftsPilotSqlite(
    db, scope, "monthly-maintenance", "2026-03-31", authorize), []);
  assert.deepEqual(sqlite.listRecurringInvoiceDraftsPilotSqlite(db, scope, authorize)
    .map(x => x.sequence), [1, 2, 3]);
  assert.deepEqual(readRows(db).map(x => [x.due_date, x.status]), [
    ["2026-01-31", "pending_review"], ["2026-02-28", "pending_review"],
    ["2026-03-31", "pending_review"],
  ]);
  assert.equal(db.query("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE '%ledger%'")[0].n, 0);
});

test("same ID/different request and foreign branch scope cannot reuse the schedule", () => {
  const db = memoryDb();
  sqlite.saveRecurringInvoicePilotSqlite(db, rule(), authorize);
  assert.throws(() => sqlite.saveRecurringInvoicePilotSqlite(
    db, rule({ interval: 2 }), authorize), /different schedule/);
  assert.throws(() => sqlite.saveRecurringInvoicePilotSqlite(
    db, rule({ branchId: "branch-2" }), () => {}), /constraint failed/);
  const other = { ...scope, companyId: "company-2" };
  assert.throws(() => sqlite.stageRecurringInvoiceDraftsPilotSqlite(
    db, other, "monthly-maintenance", "2026-12-31", () => {}), /does not exist/);
  assert.throws(() => sqlite.stageRecurringInvoiceDraftsPilotSqlite(
    db, scope, "monthly-maintenance", "2026-12-31", () => { throw Error("denied"); }), /denied/);
  assert.deepEqual(readRows(db), []);
});

test("SQLite optimistic status transitions gate draft generation and stale writers", () => {
  const db = memoryDb();
  sqlite.saveRecurringInvoicePilotSqlite(db, rule(), authorize);
  const paused = sqlite.changeRecurringInvoicePilotStatusSqlite(
    db, scope, "monthly-maintenance", 1, "paused", authorize);
  assert.equal(paused.version, 2);
  assert.deepEqual(sqlite.stageRecurringInvoiceDraftsPilotSqlite(
    db, scope, "monthly-maintenance", "2026-12-31", authorize), []);
  assert.throws(() => sqlite.changeRecurringInvoicePilotStatusSqlite(
    db, scope, "monthly-maintenance", 1, "active", authorize), /revision/);
  sqlite.changeRecurringInvoicePilotStatusSqlite(
    db, scope, "monthly-maintenance", 2, "active", authorize);
  assert.equal(sqlite.stageRecurringInvoiceDraftsPilotSqlite(
    db, scope, "monthly-maintenance", "2026-02-28", authorize).length, 2);
  sqlite.changeRecurringInvoicePilotStatusSqlite(
    db, scope, "monthly-maintenance", 3, "cancelled", authorize);
  assert.deepEqual(sqlite.stageRecurringInvoiceDraftsPilotSqlite(
    db, scope, "monthly-maintenance", "2026-12-31", authorize), []);
});

test("SQL transaction rollback prevents partial pending-review batches", () => {
  const db = memoryDb();
  sqlite.saveRecurringInvoicePilotSqlite(db, rule(), authorize);
  let inserts = 0;
  const sabotaged = {
    ...db,
    exec(sql, params) {
      if (sql.includes("INSERT INTO recurring_invoice_draft_pilot_v1") && ++inserts === 2) {
        throw new Error("disk write failed");
      }
      return db.exec(sql, params);
    },
  };
  assert.throws(() => sqlite.stageRecurringInvoiceDraftsPilotSqlite(
    sabotaged, scope, "monthly-maintenance", "2026-03-31", authorize), /disk write failed/);
  assert.deepEqual(readRows(db), []);
});

test("corrupt persisted schedule JSON is never silently accepted", () => {
  const db = memoryDb();
  sqlite.saveRecurringInvoicePilotSqlite(db, rule(), authorize);
  db.exec("UPDATE recurring_invoice_schedule_pilot_v1 SET payload_json='{}'");
  assert.throws(() => sqlite.stageRecurringInvoiceDraftsPilotSqlite(
    db, scope, "monthly-maintenance", "2026-12-31", authorize), /Corrupt/);
  assert.deepEqual(readRows(db), []);
});

const trustedCatalogReaders = () => ({
  getSourceSale(saleId) {
    assert.equal(saleId, "issued-invoice-1");
    return {
      id: saleId, branchId: scope.branchId, customerId: "customer-1",
      status: "completed", items: [{ productId: "annual-service" }],
    };
  },
  getCustomer(customerId) {
    return { id: customerId, branchId: scope.branchId, name: "Customer" };
  },
  getProduct(productId) {
    return {
      id: productId, branchId: scope.branchId, name: "Annual service",
      sellingPrice: 200, costPrice: 40, stockQuantity: 20,
      discount: 0, taxRate: 0, isActive: true,
    };
  },
});

test("persisted staged invoice draft gives current-price checkout preview without sale posting", () => {
  const db = memoryDb();
  sqlite.saveRecurringInvoicePilotSqlite(db, rule(), authorize);
  const [draft] = sqlite.stageRecurringInvoiceDraftsPilotSqlite(
    db, scope, "monthly-maintenance", "2026-01-31", authorize);
  const before = JSON.stringify(readRows(db));
  const checked = sqlite.previewRecurringInvoiceDraftPilotSqlite(
    db, scope, draft.id, "2026-01-31", authorize, trustedCatalogReaders());
  assert.equal(checked.kind, "nonbinding_recurring_invoice_checkout_preview");
  assert.equal(checked.occurrenceId, draft.id);
  assert.equal(checked.totals.grandTotal, 200);
  assert.equal(checked.requiresManualApproval, true);
  assert.equal(JSON.stringify(readRows(db)), before, "preview may not mutate staged data");
});

test("SQLite pending review rejects foreign-branch ids, tampered due dates and pauses", () => {
  const db = memoryDb();
  sqlite.saveRecurringInvoicePilotSqlite(db, rule(), authorize);
  const [draft] = sqlite.stageRecurringInvoiceDraftsPilotSqlite(
    db, scope, "monthly-maintenance", "2026-01-31", authorize);
  assert.throws(() => sqlite.previewRecurringInvoiceDraftPilotSqlite(
    db, { ...scope, branchId: "branch-other" }, draft.id,
    "2026-01-31", () => {}, trustedCatalogReaders()), /not found/);
  assert.throws(() => sqlite.previewRecurringInvoiceDraftPilotSqlite(
    db, scope, draft.id, "2026-01-31",
    () => { throw Error("staff cannot review"); }, trustedCatalogReaders()), /cannot review/);
  db.exec("UPDATE recurring_invoice_draft_pilot_v1 SET due_date='2026-01-30'");
  assert.throws(() => sqlite.previewRecurringInvoiceDraftPilotSqlite(
    db, scope, draft.id, "2026-01-31", authorize, trustedCatalogReaders()), /not an authorised/);
  db.exec("UPDATE recurring_invoice_draft_pilot_v1 SET due_date='2026-01-31'");
  sqlite.changeRecurringInvoicePilotStatusSqlite(
    db, scope, "monthly-maintenance", 1, "paused", authorize);
  assert.throws(() => sqlite.previewRecurringInvoiceDraftPilotSqlite(
    db, scope, draft.id, "2026-01-31", authorize, trustedCatalogReaders()), /Only active/);
});

function seededPostingDb() {
  const db = memoryDb();
  db.exec(`CREATE TABLE authorised_financial_sale_fixture (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL, company_id TEXT NOT NULL, branch_id TEXT NOT NULL,
    recurrence_key TEXT NOT NULL UNIQUE, total INTEGER NOT NULL CHECK(total > 0)
  )`);
  sqlite.saveRecurringInvoicePilotSqlite(db, rule(), authorize);
  sqlite.stageRecurringInvoiceDraftsPilotSqlite(
    db, scope, "monthly-maintenance", "2026-03-31", authorize);
  return db;
}
function postingInput(db, draftId = "monthly-maintenance:1", patch = {}) {
  return {
    ...scope, draftId, businessDate: "2026-03-31",
    authorizeApproval: authorize, live: trustedCatalogReaders(),
    getAuthenticatedApproverId: () => "cashier-manager-id",
    postFinancialInvoice(tx, preview, key) {
      const invoiceId = `invoice-${preview.sequence ?? preview.occurrenceId}`;
      tx.exec(`INSERT INTO authorised_financial_sale_fixture
        (id,org_id,company_id,branch_id,recurrence_key,total)
        VALUES (?,?,?,?,?,?)`,
      [invoiceId, preview.organizationId, preview.companyId,
        preview.branchId, key, preview.totals.grandTotal * 100]);
      return { invoiceId };
    },
    verifyPostedInvoice(tx, invoiceId, preview, key) {
      const records = tx.query(`SELECT id FROM authorised_financial_sale_fixture
        WHERE id=? AND org_id=? AND company_id=? AND branch_id=?
          AND recurrence_key=? AND total=?`,
      [invoiceId, preview.organizationId, preview.companyId,
        preview.branchId, key, preview.totals.grandTotal * 100]);
      return records.length === 1;
    },
    ...patch,
  };
}
function postedFixtures(db) {
  return db.query("SELECT * FROM authorised_financial_sale_fixture ORDER BY id");
}

test("reviewed recurring invoice post commits one financial fixture and acknowledgment atomically", () => {
  const db = seededPostingDb();
  const first = sqlite.postRecurringInvoiceDraftPilotSqlite(db, postingInput(db));
  assert.equal(first.disposition, "posted");
  assert.equal(first.invoiceId, "invoice-monthly-maintenance:1");
  assert.equal(postedFixtures(db).length, 1);
  assert.equal(postedFixtures(db)[0].total, 20000);
  const stored = readRows(db).find(x => x.id === "monthly-maintenance:1");
  assert.equal(stored.status, "posted");
  assert.equal(stored.posted_invoice_id, first.invoiceId);
  assert.equal(stored.approved_by, "cashier-manager-id");
  assert.equal(sqlite.listRecurringInvoiceDraftsPilotSqlite(db, scope, authorize).length, 2);
  const replay = sqlite.postRecurringInvoiceDraftPilotSqlite(db, postingInput(db, first.draftId, {
    postFinancialInvoice() { throw Error("writer must not run on already posted draft"); },
  }));
  assert.deepEqual(replay, { disposition: "already_posted",
    draftId: first.draftId, invoiceId: first.invoiceId });
  assert.equal(postedFixtures(db).length, 1);
});

test("denied reviewer, zero-write financial callback, unverified invoice and failures all rollback", () => {
  const db = seededPostingDb();
  const initial = JSON.stringify(readRows(db));
  const invalidCases = [
    postingInput(db, undefined, {
      authorizeApproval() { throw Error("not approved"); },
    }),
    postingInput(db, undefined, {
      getAuthenticatedApproverId() { return ""; },
    }),
    postingInput(db, undefined, {
      postFinancialInvoice() { return { invoiceId: "ghost" }; },
    }),
    postingInput(db, undefined, {
      verifyPostedInvoice() { return false; },
    }),
    postingInput(db, undefined, {
      postFinancialInvoice(tx, preview, key) {
        tx.exec(`INSERT INTO authorised_financial_sale_fixture
          (id,org_id,company_id,branch_id,recurrence_key,total)
          VALUES (?,?,?,?,?,?)`,
        ["invoice-disk-fail", preview.organizationId, preview.companyId,
          preview.branchId, key, 20000]);
        throw new Error("simulated invoice transaction crash");
      },
    }),
  ];
  for (const input of invalidCases) {
    assert.throws(() => sqlite.postRecurringInvoiceDraftPilotSqlite(db, input));
    assert.equal(JSON.stringify(readRows(db)), initial);
    assert.deepEqual(postedFixtures(db), []);
  }
});

test("posting is single-use across drafts and refuses wrong-branch or altered persisted day", () => {
  const db = seededPostingDb();
  const first = sqlite.postRecurringInvoiceDraftPilotSqlite(db, postingInput(db));
  assert.equal(first.disposition, "posted");
  assert.throws(() => sqlite.postRecurringInvoiceDraftPilotSqlite(db, postingInput(
    db, "monthly-maintenance:2", { postFinancialInvoice(tx, preview, key) {
      tx.exec(`INSERT INTO authorised_financial_sale_fixture
        (id,org_id,company_id,branch_id,recurrence_key,total)
        VALUES (?,?,?,?,?,?)`,
      [first.invoiceId, preview.organizationId, preview.companyId,
        preview.branchId, key, 20000]);
      return { invoiceId: first.invoiceId };
    } },
  )), /UNIQUE constraint/);
  assert.equal(postedFixtures(db).length, 1);
  assert.throws(() => sqlite.postRecurringInvoiceDraftPilotSqlite(db, {
    ...postingInput(db, "monthly-maintenance:2"),
    branchId: "foreign-branch",
    authorizeApproval() {},
  }), /out of branch/);
  db.exec("UPDATE recurring_invoice_draft_pilot_v1 SET due_date='2026-02-01' WHERE sequence=2");
  assert.throws(() => sqlite.postRecurringInvoiceDraftPilotSqlite(
    db, postingInput(db, "monthly-maintenance:2")), /not an authorised/);
  assert.equal(postedFixtures(db).length, 1);
});

test("daily and yearly schedules preserve anchors at month and leap-year boundaries", () => {
  const daily = logic.createRecurringInvoiceSchedule(rule({
    frequency: "daily", interval: 2, maxOccurrences: 4,
    firstDueDate: "2026-02-27",
  }));
  assert.deepEqual(logic.planRecurringInvoiceDue(daily, "2026-03-06", [])
    .map(x => x.dueDate), [
    "2026-02-27", "2026-03-01", "2026-03-03", "2026-03-05",
  ]);
  const annual = logic.createRecurringInvoiceSchedule(rule({
    frequency: "yearly", firstDueDate: "2028-02-29",
    maxOccurrences: 5,
  }));
  assert.deepEqual(logic.planRecurringInvoiceDue(annual, "2032-03-01", [])
    .map(x => x.dueDate), [
    "2028-02-29", "2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29",
  ]);
});

test("schedule list returns only trusted branch records with revisions and fails on corrupt JSON", () => {
  const db = memoryDb();
  const baseline = sqlite.saveRecurringInvoicePilotSqlite(db, rule(), authorize);
  assert.equal(baseline.schedule.status, "active");
  sqlite.saveRecurringInvoicePilotSqlite(db, rule({
    id: "monthly-maintenance-2", customerId: "customer-2",
  }), authorize);
  assert.deepEqual(sqlite.listRecurringInvoiceSchedulesPilotSqlite(
    db, scope, authorize).map(x => [x.id, x.status, x.version]), [
    ["monthly-maintenance", "active", 1],
    ["monthly-maintenance-2", "active", 1],
  ]);
  sqlite.changeRecurringInvoicePilotStatusSqlite(
    db, scope, "monthly-maintenance", 1, "paused", authorize);
  const view = sqlite.listRecurringInvoiceSchedulesPilotSqlite(db, scope, authorize);
  assert.equal(view[0].status, "paused");
  assert.equal(view[0].version, 2);
  assert.deepEqual(sqlite.listRecurringInvoiceSchedulesPilotSqlite(
    db, { ...scope, branchId: "foreign-branch" }, () => {}), []);
  assert.throws(() => sqlite.listRecurringInvoiceSchedulesPilotSqlite(
    db, scope, () => { throw Error("read denied"); }), /read denied/);
  db.exec(`UPDATE recurring_invoice_schedule_pilot_v1
    SET payload_json='{}' WHERE id='monthly-maintenance-2'`);
  assert.throws(() => sqlite.listRecurringInvoiceSchedulesPilotSqlite(
    db, scope, authorize), /Corrupt/);
});
