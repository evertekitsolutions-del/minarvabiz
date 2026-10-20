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
const { planKitReservationCreate, planKitReservationFinalize } =
  require("../commerce-kit-reservation-transitions.ts");

const lot = (id, sku, units, options = {}) => ({
  id, batchCode: id, productId: sku, orgId: "org-A",
  warehouseId: "warehouse-A", status: "active",
  expiresOn: "2027-06-01", onHandMilli: units, reservedMilli: 0,
  version: 3, ...options,
});
const request = (options = {}) => ({
  reservationId: "reservation-101", orgId: "org-A",
  warehouseId: "warehouse-A", asOfDate: "2026-10-21",
  kitCount: 2,
  components: [
    { productId: "sku-A", quantityMilliPerBundle: 1000 },
    { productId: "sku-A", quantityMilliPerBundle: 500 },
    { productId: "sku-B", quantityMilliPerBundle: 2000 },
  ],
  lots: [
    lot("a-later", "sku-A", 3000),
    lot("a-first", "sku-A", 1000, { expiresOn: "2026-11-01" }),
    lot("b-first", "sku-B", 6000),
  ],
  ...options,
});
const committedLots = (input, plan) => input.lots.map(lot =>
  plan.lotPatches.find(p => p.lotId === lot.id)?.next ?? lot);

test("creates one all-SKU FEFO reservation with exact versioned CAS patches, no mutations", () => {
  const input = request();
  const before = JSON.stringify(input);
  const plan = planKitReservationCreate(input);
  assert.equal(plan.disposition, "new");
  assert.equal(plan.reservation.version, 1);
  assert.equal(plan.reservation.status, "reserved");
  assert.deepEqual(plan.reservation.components, [
    { productId: "sku-A", quantityMilliPerBundle: 1500 },
    { productId: "sku-B", quantityMilliPerBundle: 2000 },
  ]);
  assert.deepEqual(plan.reservation.allocations, [
    { lotId: "a-first", productId: "sku-A", quantityMilli: 1000 },
    { lotId: "a-later", productId: "sku-A", quantityMilli: 2000 },
    { lotId: "b-first", productId: "sku-B", quantityMilli: 4000 },
  ]);
  assert.deepEqual(plan.lotPatches.map(p => [p.lotId, p.expectedVersion, p.next.version, p.next.reservedMilli]), [
    ["a-first", 3, 4, 1000],
    ["a-later", 3, 4, 2000],
    ["b-first", 3, 4, 4000],
  ]);
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.lotPatches));
  assert.ok(Object.isFrozen(plan.lotPatches[0].next));
  assert.equal(JSON.stringify(input), before);
});

test("idempotent replay returns zero stock patches for same persisted reservation only", () => {
  const initial = request();
  const first = planKitReservationCreate(initial);
  const retry = planKitReservationCreate(request({
    lots: committedLots(initial, first), existingReservation: first.reservation,
  }));
  assert.equal(retry.disposition, "already_reserved");
  assert.deepEqual(retry.lotPatches, []);
  assert.equal(retry.reservation.id, first.reservation.id);
  for (const change of [
    { kitCount: 3 }, { warehouseId: "other" },
    { reservationId: "different" }, { asOfDate: "2026-10-22" },
    { components: [{ productId: "sku-A", quantityMilliPerBundle: 1000 }] },
  ]) {
    assert.throws(() => planKitReservationCreate(request({
      existingReservation: first.reservation, ...change,
    })), /different kit request/);
  }
  assert.throws(() => planKitReservationCreate(request({
    existingReservation: { ...first.reservation, status: "fulfilled" },
  })), /finalized/);
});

test("successful release restores available capacity, not physical on-hand stock", () => {
  const input = request();
  const reserved = planKitReservationCreate(input);
  const rows = committedLots(input, reserved);
  const before = JSON.stringify(rows);
  const release = planKitReservationFinalize({
    reservation: reserved.reservation,
    expectedReservationVersion: 1,
    operation: "release", lots: rows,
  });
  assert.equal(release.reservation.status, "released");
  assert.equal(release.reservation.version, 2);
  assert.ok(Object.isFrozen(release.reservation));
  for (const p of release.lotPatches) {
    const previous = rows.find(lot => lot.id === p.lotId);
    assert.equal(p.next.reservedMilli, previous.reservedMilli -
      reserved.reservation.allocations.find(a => a.lotId === p.lotId).quantityMilli);
    assert.equal(p.next.onHandMilli, previous.onHandMilli);
    assert.equal(p.next.version, previous.version + 1);
  }
  assert.equal(JSON.stringify(rows), before);
  assert.throws(() => planKitReservationFinalize({
    reservation: release.reservation, expectedReservationVersion: 2,
    operation: "release", lots: release.lotPatches.map(p => p.next),
  }), /not active/);
});

test("fulfillment reduces reserved and physical stock once for every committed lot", () => {
  const input = request();
  const reserved = planKitReservationCreate(input);
  const rows = committedLots(input, reserved);
  const fulfilled = planKitReservationFinalize({
    reservation: reserved.reservation, expectedReservationVersion: 1,
    operation: "fulfill", fulfillmentDate: "2026-10-21", lots: rows,
  });
  assert.equal(fulfilled.reservation.status, "fulfilled");
  for (const update of fulfilled.lotPatches) {
    const previous = rows.find(lot => lot.id === update.lotId);
    const quantity = reserved.reservation.allocations.find(a => a.lotId === update.lotId).quantityMilli;
    assert.equal(update.next.onHandMilli, previous.onHandMilli - quantity);
    assert.equal(update.next.reservedMilli, previous.reservedMilli - quantity);
  }
  assert.throws(() => planKitReservationFinalize({
    reservation: fulfilled.reservation, expectedReservationVersion: 2,
    operation: "fulfill", lots: fulfilled.lotPatches.map(p => p.next),
  }), /not active/);
});

test("shortage, expired lots, blocked lots and unsafe version reject without partial plan", () => {
  for (const bad of [
    { lots: [lot("a", "sku-A", 3000), lot("b", "sku-B", 3999)] },
    { lots: [lot("a", "sku-A", 3000, { expiresOn: "2026-10-20" }), lot("b", "sku-B", 4000)] },
    { lots: [lot("a", "sku-A", 3000, { status: "blocked" }), lot("b", "sku-B", 4000)] },
    { lots: [lot("a", "sku-A", 3000, { version: Number.MAX_SAFE_INTEGER }), lot("b", "sku-B", 4000)] },
  ]) {
    const input = request(bad);
    const before = JSON.stringify(input);
    assert.throws(() => planKitReservationCreate(input));
    assert.equal(JSON.stringify(input), before);
  }
});

test("no cross-org, cross-warehouse, unrelated or duplicate stock lots can enter CAS", () => {
  for (const wrong of [
    lot("wrong-org", "sku-A", 2000, { orgId: "org-B" }),
    lot("wrong-warehouse", "sku-A", 2000, { warehouseId: "warehouse-B" }),
    lot("other-sku", "sku-Q", 2000),
  ]) assert.throws(() => planKitReservationCreate(request({ lots: [...request().lots, wrong] })),
    /scope (?:or identity )?mismatch/);
  assert.throws(() => planKitReservationCreate(request({
    lots: [lot("same", "sku-A", 3000), lot("same", "sku-B", 5000)],
  })), /Duplicate/);
});

test("finalization rejects missing/reassigned or under-reserved lot, stale record, corrupt allocation", () => {
  const input = request();
  const reserved = planKitReservationCreate(input);
  const rows = committedLots(input, reserved);
  const requestFinalize = (overrides = {}) => ({
    reservation: reserved.reservation, expectedReservationVersion: 1,
    operation: "release", lots: rows, ...overrides,
  });
  const unchanged = JSON.stringify(rows);
  assert.throws(() => planKitReservationFinalize(requestFinalize({
    expectedReservationVersion: 2,
  })), /not active/);
  assert.throws(() => planKitReservationFinalize(requestFinalize({
    lots: rows.filter(lot => lot.id !== "a-first"),
  })), /missing or changed/);
  assert.throws(() => planKitReservationFinalize(requestFinalize({
    lots: rows.map(lot => lot.id === "a-first" ?
      { ...lot, reservedMilli: 999 } : lot),
  })), /exceeds trusted stock/);
  assert.throws(() => planKitReservationFinalize(requestFinalize({
    lots: rows.map(lot => lot.id === "a-first" ?
      { ...lot, productId: "sku-B" } : lot),
  })), /missing or changed/);
  assert.throws(() => planKitReservationFinalize(requestFinalize({
    reservation: {
      ...reserved.reservation,
      allocations: reserved.reservation.allocations.slice(1),
    },
  })), /quantity does not match/);
  assert.throws(() => planKitReservationFinalize(requestFinalize({
    reservation: {
      ...reserved.reservation,
      allocations: [...reserved.reservation.allocations, reserved.reservation.allocations[0]],
    },
  })), /duplicate/);
  assert.equal(JSON.stringify(rows), unchanged);
});

test("overflow, zero/noninteger kit counts and malformed idempotency inputs fail closed", () => {
  for (const kitCount of [0, -1, 1.25, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => planKitReservationCreate(request({ kitCount })));
  }
  assert.throws(() => planKitReservationCreate(request({ reservationId: " " })), /Invalid/);
  assert.throws(() => planKitReservationCreate(request({
    components: [
      { productId: "sku-A", quantityMilliPerBundle: Number.MAX_SAFE_INTEGER },
      { productId: "sku-A", quantityMilliPerBundle: 1 },
    ],
  })), /overflow/);
  assert.throws(() => planKitReservationCreate(request({
    components: [{ productId: "sku-A", quantityMilliPerBundle: Number.MAX_SAFE_INTEGER }],
  })), /safe integer range/);
});

test("fulfillment refuses newly expired or blocked lot; release still frees reserved capacity", () => {
  const input = request();
  const planned = planKitReservationCreate(input);
  const baseRows = committedLots(input, planned);
  for (const changed of [
    { expiresOn: "2026-10-21", status: "active" },
    { expiresOn: "2027-06-01", status: "blocked" },
  ]) {
    const rows = baseRows.map(lot => lot.id === "a-first" ? { ...lot, ...changed } : lot);
    const before = JSON.stringify(rows);
    assert.throws(() => planKitReservationFinalize({
      reservation: planned.reservation, expectedReservationVersion: 1,
      operation: "fulfill", fulfillmentDate: "2026-10-22", lots: rows,
    }), /blocked or expired/);
    assert.equal(JSON.stringify(rows), before);
    const released = planKitReservationFinalize({
      reservation: planned.reservation, expectedReservationVersion: 1,
      operation: "release", lots: rows,
    });
    assert.equal(released.reservation.status, "released");
    assert.equal(released.lotPatches.length, 3);
  }
});

test("fulfillment requires real current business date, not invalid, missing or backdated time", () => {
  const input = request();
  const reserved = planKitReservationCreate(input);
  const base = {
    reservation: reserved.reservation, expectedReservationVersion: 1,
    operation: "fulfill", lots: committedLots(input, reserved),
  };
  for (const fulfillmentDate of [undefined, "", "2026-02-30", "2026-10-20",
    "2026-10-21T03:00:00Z", "2026-13-01"]) {
    assert.throws(() => planKitReservationFinalize({ ...base, fulfillmentDate }),
      /valid current business date/);
  }
  const allowed = planKitReservationFinalize({ ...base, fulfillmentDate: "2026-10-21" });
  assert.equal(allowed.reservation.status, "fulfilled");
  assert.throws(() => planKitReservationFinalize({
    ...base,
    reservation: { ...reserved.reservation, asOfDate: "2026-02-30" },
    fulfillmentDate: "2026-10-21",
  }), /Invalid persisted kit reservation date/);
});

test("corrupted expiry or lot status is rejected for both release and fulfillment", () => {
  const input = request();
  const reserved = planKitReservationCreate(input);
  const rows = committedLots(input, reserved);
  for (const invalid of [
    { expiresOn: "2027-02-30" },
    { status: "unknown" },
  ]) {
    assert.throws(() => planKitReservationFinalize({
      reservation: reserved.reservation,
      expectedReservationVersion: 1, operation: "release",
      lots: rows.map(lot => lot.id === "a-first" ? { ...lot, ...invalid } : lot),
    }), /Invalid reservation lot status or expiry date/);
  }
});
