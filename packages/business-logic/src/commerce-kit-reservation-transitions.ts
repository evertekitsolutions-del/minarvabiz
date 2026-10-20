/**
 * INV-017: pure compare-and-swap patches for multi-SKU kit stock reservations.
 *
 * THESE ARE TRANSACTION INPUTS, NOT STOCK MUTATIONS. Only an authorized
 * SQLite/PostgreSQL writer may lock all lot + reservation rows, check exact
 * expected versions and idempotency, and commit patches with the financial
 * event atomically. Never apply these from browser/renderer authority.
 */
import {
  preflightCommerceBundleStock,
  type CommerceBundleComponent,
  type CommerceBundlePreflightInput,
} from "./commerce-bundle-stock";
import type { TrackedLot } from "./tracked-inventory";

export interface VersionedBundleLot extends TrackedLot {
  readonly version: number;
}
export interface KitReservationAllocation {
  readonly lotId: string;
  readonly productId: string;
  readonly quantityMilli: number;
}
export interface KitReservationRecord {
  readonly id: string;
  readonly orgId: string;
  readonly warehouseId: string;
  readonly asOfDate: string;
  readonly kitCount: number;
  readonly components: readonly CommerceBundleComponent[];
  readonly allocations: readonly KitReservationAllocation[];
  readonly status: "reserved" | "released" | "fulfilled";
  readonly version: number;
}
export interface KitLotCasPatch {
  readonly lotId: string;
  readonly expectedVersion: number;
  readonly next: VersionedBundleLot;
}
export interface KitReservationCreateRequest
  extends Omit<CommerceBundlePreflightInput, "lots" | "bundleCount"> {
  readonly reservationId: string;
  /** Requested number of completed kits (whole units only). */
  readonly kitCount: number;
  /** Stock-lot rows from a trusted repository, including CAS versions. */
  readonly lots: readonly VersionedBundleLot[];
  /** Already persisted row from trusted repository, if idempotency ID exists. */
  readonly existingReservation?: KitReservationRecord | null;
}
export interface KitReservationCreatePlan {
  readonly disposition: "new" | "already_reserved";
  readonly reservation: KitReservationRecord;
  readonly lotPatches: readonly KitLotCasPatch[];
}
export interface KitReservationFinalizeRequest {
  readonly reservation: KitReservationRecord;
  readonly expectedReservationVersion: number;
  readonly operation: "release" | "fulfill";
  /** Current locked candidates fetched under the same tenant/warehouse scope. */
  readonly lots: readonly VersionedBundleLot[];
}
export interface KitReservationFinalizePlan {
  readonly expectedReservationVersion: number;
  readonly reservation: KitReservationRecord;
  readonly lotPatches: readonly KitLotCasPatch[];
}

const safePositive = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n > 0;
const id = (n: unknown): n is string =>
  typeof n === "string" && n.trim().length > 0 && n === n.trim();
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function checkVersion(version: unknown): asserts version is number {
  if (!safePositive(version) || version >= Number.MAX_SAFE_INTEGER) {
    throw new Error("Invalid or exhausted stock/reservation version");
  }
}
function checkLot(lot: VersionedBundleLot, orgId: string, warehouseId: string): void {
  if (!lot || !id(lot.id) || !id(lot.productId) ||
      lot.orgId !== orgId || lot.warehouseId !== warehouseId) {
    throw new Error("Reservation lot scope or identity mismatch");
  }
  checkVersion(lot.version);
  if (!Number.isSafeInteger(lot.onHandMilli) || lot.onHandMilli < 0 ||
      !Number.isSafeInteger(lot.reservedMilli) || lot.reservedMilli < 0 ||
      lot.reservedMilli > lot.onHandMilli) {
    throw new Error("Invalid reservation lot quantities");
  }
}
function canonicalComponents(rows: readonly CommerceBundleComponent[]): readonly CommerceBundleComponent[] {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 100) {
    throw new Error("Reservation requires 1 to 100 kit components");
  }
  const quantities = new Map<string, bigint>();
  for (const row of rows) {
    if (!row || !id(row.productId) || !safePositive(row.quantityMilliPerBundle)) {
      throw new Error("Invalid kit component quantity or SKU");
    }
    const next = (quantities.get(row.productId) ?? 0n) + BigInt(row.quantityMilliPerBundle);
    if (next > MAX) throw new Error("Kit component quantity overflow");
    quantities.set(row.productId, next);
  }
  return Object.freeze([...quantities].sort(([a], [b]) => a.localeCompare(b))
    .map(([productId, quantity]) => Object.freeze({
      productId, quantityMilliPerBundle: Number(quantity),
    })));
}
function frozenLot(next: VersionedBundleLot): VersionedBundleLot {
  return Object.freeze({ ...next });
}
function patch(lot: VersionedBundleLot, reservedDelta: number, stockDelta: number): KitLotCasPatch {
  checkVersion(lot.version);
  const reserved = BigInt(lot.reservedMilli) + BigInt(reservedDelta);
  const stock = BigInt(lot.onHandMilli) + BigInt(stockDelta);
  if (reserved < 0n || stock < 0n || reserved > stock || stock > MAX || reserved > MAX) {
    throw new Error("Lot reservation or fulfillment exceeds trusted stock");
  }
  return Object.freeze({
    lotId: lot.id,
    expectedVersion: lot.version,
    next: frozenLot({
      ...lot, reservedMilli: Number(reserved), onHandMilli: Number(stock),
      version: lot.version + 1,
    }),
  });
}
function verifyReservationIdentity(r: KitReservationRecord, idValue: string, scope: {
  orgId: string; warehouseId: string; asOfDate: string;
  kitCount: number; components: readonly CommerceBundleComponent[];
}): void {
  if (!r || r.id !== idValue || r.orgId !== scope.orgId ||
      r.warehouseId !== scope.warehouseId || r.asOfDate !== scope.asOfDate ||
      r.kitCount !== scope.kitCount || !safePositive(r.version) ||
      !Array.isArray(r.components) || !Array.isArray(r.allocations) ||
      JSON.stringify(canonicalComponents(r.components)) !== JSON.stringify(scope.components)) {
    throw new Error("Reservation idempotency key already belongs to different kit request");
  }
}

/**
 * Return all-or-throw patch set. A replay MUST be resolved against a trusted
 * persisted reservation record and committed unique ID, not client-supplied
 * state. Consumers must never write a result marked already_reserved.
 */
export function planKitReservationCreate(
  input: KitReservationCreateRequest,
): KitReservationCreatePlan {
  if (!input || !id(input.reservationId) ||
      !id(input.orgId) || !id(input.warehouseId) ||
      !safePositive(input.kitCount) || !Array.isArray(input.lots)) {
    throw new Error("Invalid kit reservation request");
  }
  const components = canonicalComponents(input.components);
  if (input.existingReservation) {
    const prior = input.existingReservation;
    verifyReservationIdentity(prior, input.reservationId, {
      orgId: input.orgId, warehouseId: input.warehouseId,
      asOfDate: input.asOfDate, kitCount: input.kitCount, components,
    });
    if (prior.status !== "reserved") {
      throw new Error("Reservation has already been finalized; cannot reuse ID");
    }
    return Object.freeze({
      disposition: "already_reserved",
      reservation: prior,
      lotPatches: Object.freeze([]),
    });
  }

  const lotsById = new Map<string, VersionedBundleLot>();
  for (const lot of input.lots) {
    checkLot(lot, input.orgId, input.warehouseId);
    if (lotsById.has(lot.id)) throw new Error("Duplicate reservation lot ID");
    lotsById.set(lot.id, lot);
  }
  // Delegate expiry/blocked/reserved FEFO feasibility for every kit SKU.
  const result = preflightCommerceBundleStock({
    orgId: input.orgId, warehouseId: input.warehouseId,
    asOfDate: input.asOfDate, bundleCount: input.kitCount,
    components, lots: input.lots,
  });
  const allocations: KitReservationAllocation[] = [];
  const lotPatches: KitLotCasPatch[] = [];
  for (const requirement of result) {
    for (const selected of requirement.allocations) {
      const lot = lotsById.get(selected.batchId);
      if (!lot || lot.productId !== requirement.productId) {
        throw new Error("Reservation lot allocation product mismatch");
      }
      allocations.push(Object.freeze({
        lotId: lot.id,
        productId: requirement.productId,
        quantityMilli: selected.quantityMilli,
      }));
      lotPatches.push(patch(lot, selected.quantityMilli, 0));
    }
  }
  lotPatches.sort((a, b) => a.lotId.localeCompare(b.lotId));
  const reservation: KitReservationRecord = Object.freeze({
    id: input.reservationId,
    orgId: input.orgId,
    warehouseId: input.warehouseId,
    asOfDate: input.asOfDate,
    kitCount: input.kitCount,
    components,
    allocations: Object.freeze(allocations),
    status: "reserved",
    version: 1,
  });
  return Object.freeze({
    disposition: "new",
    reservation,
    lotPatches: Object.freeze(lotPatches),
  });
}

/**
 * Separate release and fulfillment CAS plans. A fulfilled reservation reduces
 * BOTH on-hand and reserved stock in the same transaction. A released one
 * decreases reserved only. The persisted reservation's state/version must
 * also be checked and updated atomically by the authoritative writer.
 */
export function planKitReservationFinalize(
  input: KitReservationFinalizeRequest,
): KitReservationFinalizePlan {
  if (!input || !input.reservation ||
      !["release", "fulfill"].includes(input.operation) ||
      !Array.isArray(input.lots) ||
      !safePositive(input.expectedReservationVersion)) {
    throw new Error("Invalid kit reservation transition request");
  }
  const current = input.reservation;
  checkVersion(current.version);
  if (!id(current.id) || !id(current.orgId) || !id(current.warehouseId) ||
      current.version !== input.expectedReservationVersion ||
      current.status !== "reserved" ||
      !safePositive(current.kitCount) || !Array.isArray(current.allocations)) {
    throw new Error("Reservation is not active at expected revision");
  }
  const components = canonicalComponents(current.components);
  // Ensure persisted allocations cover exactly the reserved kit quantities.
  const wanted = new Map(components.map(c => [
    c.productId, BigInt(c.quantityMilliPerBundle) * BigInt(current.kitCount),
  ]));
  const provided = new Map<string, bigint>();
  const selectedLots = new Map<string, KitReservationAllocation>();
  for (const a of current.allocations) {
    if (!a || !id(a.lotId) || !wanted.has(a.productId) ||
        !safePositive(a.quantityMilli) || selectedLots.has(a.lotId)) {
      throw new Error("Invalid or duplicate persisted reservation allocation");
    }
    selectedLots.set(a.lotId, a);
    provided.set(a.productId, (provided.get(a.productId) ?? 0n) + BigInt(a.quantityMilli));
  }
  for (const [productId, total] of wanted) {
    if (total > MAX || total !== (provided.get(productId) ?? 0n)) {
      throw new Error("Persisted reservation quantity does not match kit composition");
    }
  }
  const rows = new Map<string, VersionedBundleLot>();
  for (const lot of input.lots) {
    checkLot(lot, current.orgId, current.warehouseId);
    if (rows.has(lot.id)) throw new Error("Duplicate reservation lot ID");
    rows.set(lot.id, lot);
  }
  const patches = [...selectedLots.values()].map((allocation) => {
    const lot = rows.get(allocation.lotId);
    if (!lot || lot.productId !== allocation.productId) {
      throw new Error("Reserved lot missing or changed SKU");
    }
    return patch(lot, -allocation.quantityMilli,
      input.operation === "fulfill" ? -allocation.quantityMilli : 0);
  }).sort((a, b) => a.lotId.localeCompare(b.lotId));
  const next: KitReservationRecord = Object.freeze({
    ...current, version: current.version + 1,
    status: input.operation === "fulfill" ? "fulfilled" : "released",
    allocations: Object.freeze([...current.allocations].map(a => Object.freeze({ ...a }))),
    components: Object.freeze([...components]),
  });
  return Object.freeze({
    expectedReservationVersion: current.version,
    reservation: next,
    lotPatches: Object.freeze(patches),
  });
}
