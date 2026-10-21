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
const kit = require("../commerce-kit-sqlite-pilot.ts");
const initSqlJs = databaseRequire("sql.js/dist/sql-asm.js");
const SQL = await initSqlJs();

function memorySqlite() {
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
      } catch (err) {
        raw.run("ROLLBACK");
        throw err;
      }
    },
  };
  kit.initializeKitReservationPilotSqlite(db);
  return db;
}

function seed(db, id, sku, count, options = {}) {
  const o = { orgId: "org-1", warehouse: "main", expiry: "2027-01-01", reserved: 0, status: "active", version: 1, ...options };
  db.exec(
    `INSERT INTO kit_lot_pilot_v1
     (org_id, warehouse_id, id, product_id, batch_code, expires_on,
      on_hand_milli, reserved_milli, status, version) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [o.orgId, o.warehouse, id, sku, id, o.expiry, count, o.reserved, o.status, o.version],
  );
}
function lots(db) {
  return db.query("SELECT id, org_id, warehouse_id, product_id, on_hand_milli, reserved_milli, status, version FROM kit_lot_pilot_v1 ORDER BY org_id,id");
}
function reservedRecords(db) {
  return db.query("SELECT org_id,id,status,version,record_json FROM kit_reservation_pilot_v1 ORDER BY org_id,id");
}
function setup() {
  const db = memorySqlite();
  seed(db, "a-earlier", "sku-a", 1000, { expiry: "2026-11-01" });
  seed(db, "a-later", "sku-a", 3000);
  seed(db, "b-main", "sku-b", 5000);
  return db;
}
const authorizeWarehouse = (org, warehouse) => {
  if (org !== "org-1" || warehouse !== "main") throw new Error("warehouse access denied");
};
const newReservation = (overrides = {}) => ({
  orgId: "org-1", warehouseId: "main", reservationId: "kit-100",
  asOfDate: "2026-10-21", kitCount: 2,
  components: [
    { productId: "sku-a", quantityMilliPerBundle: 1500 },
    { productId: "sku-b", quantityMilliPerBundle: 2000 },
  ],
  authorizeWarehouse,
  ...overrides,
});

test("actual SQLite BEGIN/COMMIT records multi-SKU FEFO and reservation atomically", () => {
  const db = setup();
  const out = kit.createKitReservationPilotSqlite(db, newReservation());
  assert.equal(out.disposition, "new");
  assert.deepEqual(out.reservation.allocations.map(a => [a.lotId, a.quantityMilli]), [
    ["a-earlier", 1000], ["a-later", 2000], ["b-main", 4000],
  ]);
  assert.deepEqual(lots(db).map(x => [x.id, x.reserved_milli, x.version]), [
    ["a-earlier", 1000, 2], ["a-later", 2000, 2], ["b-main", 4000, 2],
  ]);
  assert.equal(reservedRecords(db).length, 1);
  assert.equal(reservedRecords(db)[0].status, "reserved");
});

test("replay is idempotent, conflicting reservation ID rejects without changing any rows", () => {
  const db = setup();
  kit.createKitReservationPilotSqlite(db, newReservation());
  const saved = JSON.stringify({ lots: lots(db), reservations: reservedRecords(db) });
  const retry = kit.createKitReservationPilotSqlite(db, newReservation());
  assert.equal(retry.disposition, "already_reserved");
  assert.equal(retry.lotPatches.length, 0);
  assert.equal(JSON.stringify({ lots: lots(db), reservations: reservedRecords(db) }), saved);
  assert.throws(() => kit.createKitReservationPilotSqlite(db, newReservation({ kitCount: 1 })), /different kit request/);
  assert.equal(JSON.stringify({ lots: lots(db), reservations: reservedRecords(db) }), saved);
});

test("releasing changes reserved units but not on-hand and blocks double release", () => {
  const db = setup();
  kit.createKitReservationPilotSqlite(db, newReservation());
  const result = kit.finalizeKitReservationPilotSqlite(db, {
    orgId: "org-1", reservationId: "kit-100", expectedVersion: 1,
    operation: "release", authorizeWarehouse,
  });
  assert.equal(result.reservation.status, "released");
  assert.deepEqual(lots(db).map(x => [x.id, x.on_hand_milli, x.reserved_milli, x.version]), [
    ["a-earlier", 1000, 0, 3], ["a-later", 3000, 0, 3], ["b-main", 5000, 0, 3],
  ]);
  assert.throws(() => kit.finalizeKitReservationPilotSqlite(db, {
    orgId: "org-1", reservationId: "kit-100", expectedVersion: 2,
    operation: "release", authorizeWarehouse,
  }), /not active/);
});

test("fulfillment requires same-transaction financial SQL; rollback on failed financial writer", () => {
  const db = setup();
  kit.createKitReservationPilotSqlite(db, newReservation());
  db.exec("CREATE TABLE pilot_finance_events(id TEXT PRIMARY KEY, amount INTEGER NOT NULL)");
  const before = JSON.stringify({ lots: lots(db), reservations: reservedRecords(db) });
  const args = {
    orgId: "org-1", reservationId: "kit-100", expectedVersion: 1,
    operation: "fulfill", fulfillmentDate: "2026-10-21", authorizeWarehouse,
  };
  assert.throws(() => kit.finalizeKitReservationPilotSqlite(db, args), /financial writer/);
  assert.throws(() => kit.finalizeKitReservationPilotSqlite(db, {
    ...args, commitFinancialEvent(tx, record) {
      tx.exec("INSERT INTO pilot_finance_events (id,amount) VALUES(?,?)", [record.id, 4200]);
      throw new Error("failed ledger validation");
    },
  }), /failed ledger validation/);
  assert.deepEqual(db.query("SELECT * FROM pilot_finance_events"), []);
  assert.equal(JSON.stringify({ lots: lots(db), reservations: reservedRecords(db) }), before);
  assert.throws(() => kit.finalizeKitReservationPilotSqlite(db, {
    ...args, commitFinancialEvent() {},
  }), /did not persist a SQL change/);
  assert.equal(JSON.stringify({ lots: lots(db), reservations: reservedRecords(db) }), before);
  const good = kit.finalizeKitReservationPilotSqlite(db, {
    ...args,
    commitFinancialEvent(tx, record) {
      tx.exec("INSERT INTO pilot_finance_events (id,amount) VALUES(?,?)", [record.id, 4200]);
    },
  });
  assert.equal(good.reservation.status, "fulfilled");
  assert.deepEqual(lots(db).map(x => [x.id, x.on_hand_milli, x.reserved_milli, x.version]), [
    ["a-earlier", 0, 0, 3], ["a-later", 1000, 0, 3], ["b-main", 1000, 0, 3],
  ]);
  assert.equal(db.query("SELECT COUNT(*) AS n FROM pilot_finance_events")[0].n, 1);
  assert.equal(reservedRecords(db)[0].status, "fulfilled");
  assert.throws(() => kit.finalizeKitReservationPilotSqlite(db, {
    ...args, expectedVersion: 2, commitFinancialEvent() {},
  }), /not active/);
});

test("SQLite rolls back every lot when a later CAS update fails", () => {
  const db = setup();
  const initial = JSON.stringify(lots(db));
  let attempted = 0;
  const sabotage = {
    ...db,
    exec(sql, params) {
      if (sql.includes("UPDATE kit_lot_pilot_v1") && ++attempted === 2) {
        return db.exec(sql + " AND 1=0", params);
      }
      return db.exec(sql, params);
    },
  };
  assert.throws(() => kit.createKitReservationPilotSqlite(sabotage, newReservation()), /CAS conflict/);
  assert.equal(JSON.stringify(lots(db)), initial);
  assert.deepEqual(reservedRecords(db), []);
});

test("trusted organization and warehouse permission checks prevent wrong-scope actions", () => {
  const db = setup();
  seed(db, "other-org", "sku-a", 7000, { orgId: "org-2" });
  const original = JSON.stringify(lots(db));
  assert.throws(() => kit.createKitReservationPilotSqlite(db,
    newReservation({ orgId: "org-2" })), /access denied/);
  assert.throws(() => kit.createKitReservationPilotSqlite(db,
    newReservation({ warehouseId: "other" })), /access denied/);
  assert.throws(() => kit.createKitReservationPilotSqlite(db,
    newReservation({ authorizeWarehouse: undefined })), /authorization is required/);
  assert.equal(JSON.stringify(lots(db)), original);
  const created = kit.createKitReservationPilotSqlite(db, newReservation());
  assert.equal(created.reservation.orgId, "org-1");
  assert.equal(db.query("SELECT reserved_milli FROM kit_lot_pilot_v1 WHERE org_id='org-2'")[0].reserved_milli, 0);
  assert.throws(() => kit.finalizeKitReservationPilotSqlite(db, {
    orgId: "org-2", reservationId: "kit-100", expectedVersion: 1,
    operation: "release", authorizeWarehouse,
  }), /no longer exists/);
});

test("expired stock, shortages and blocked lots reject entire SQLite transaction", () => {
  const db = memorySqlite();
  seed(db, "short-a", "sku-a", 2000);
  seed(db, "blocked-b", "sku-b", 10000, { status: "blocked" });
  const old = JSON.stringify(lots(db));
  assert.throws(() => kit.createKitReservationPilotSqlite(db, newReservation()), /Insufficient/);
  assert.equal(JSON.stringify(lots(db)), old);
  assert.deepEqual(reservedRecords(db), []);
});

test("pilot cannot operate on uninitialized tables, so production SQLite remains untouched", () => {
  const raw = new SQL.Database();
  const db = {
    exec(sql, params = []) { raw.run(sql, params); },
    query(sql, params = []) { const rows = raw.exec(sql, params); return rows.length ? rows[0].values.map(v => Object.fromEntries(rows[0].columns.map((c,i) => [c,v[i]]))) : []; },
    transaction(fn) { raw.run("BEGIN"); try { const out=fn(); raw.run("COMMIT"); return out; } catch(e){ raw.run("ROLLBACK"); throw e; } },
  };
  assert.throws(() => kit.createKitReservationPilotSqlite(db, newReservation()), /no such table/);
});
