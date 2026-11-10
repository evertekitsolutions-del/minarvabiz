/**
 * Draft-only replenishment proposal — no stock, ledger, PO, or supplier writes.
 * Integer base units and BigInt intermediates avoid floating-point money/quantity drift.
 * Tenant and warehouse authorization remains the responsibility of the caller.
 */
export interface ReplenishmentSnapshot {
  readonly orgId: string;
  readonly branchId: string;
  readonly productId: string;
  readonly preferredSupplierId: string;
  /** UTC day of the planning run, YYYY-MM-DD, supplied by the caller. */
  readonly asOfDate: string;
  readonly onHandUnits: number;
  readonly reservedUnits: number;
  readonly confirmedInboundUnits: number;
  readonly soldLookbackUnits: number;
  readonly lookbackDays: number;
  readonly supplierLeadDays: number;
  readonly safetyDays: number;
  readonly targetCoverageDays: number;
  readonly minimumStockUnits: number;
  readonly minimumOrderUnits: number;
  readonly orderMultipleUnits: number;
}

export interface ReplenishmentDraft {
  readonly kind: "draft_purchase_suggestion";
  readonly orgId: string;
  readonly branchId: string;
  readonly productId: string;
  readonly supplierId: string;
  readonly asOfDate: string;
  readonly dedupeKey: string;
  readonly projectedAvailableUnits: number;
  readonly triggerAtUnits: number;
  readonly targetStockUnits: number;
  readonly suggestedOrderUnits: number;
}

const max = (a: bigint, b: bigint) => a >= b ? a : b;
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

function units(name: string, value: number, positive = false): bigint {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
    throw new RangeError(`Invalid ${name}: expected a safe nonnegative integer`);
  }
  return BigInt(value);
}
function days(name: string, value: number, positive = false): bigint {
  if (!Number.isInteger(value) || value < (positive ? 1 : 0) || value > 3650) {
    throw new RangeError(`Invalid ${name}`);
  }
  return BigInt(value);
}
function asSafeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError("Replenishment quantity exceeds safe integer range");
  }
  return Number(value);
}

/** Deterministic, side-effect-free, tenant-scoped purchase suggestion. */
export function suggestReplenishment(snapshot: Readonly<ReplenishmentSnapshot>): ReplenishmentDraft | null {
  const { orgId, branchId, productId, preferredSupplierId, asOfDate } = snapshot;
  for (const [name, value] of Object.entries({ orgId, branchId, productId, preferredSupplierId })) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
      throw new TypeError(`Invalid ${name}`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) ||
      Number.isNaN(Date.parse(asOfDate + "T00:00:00Z")) ||
      new Date(asOfDate + "T00:00:00Z").toISOString().slice(0, 10) !== asOfDate) {
    throw new TypeError("Invalid asOfDate");
  }
  const onHand = units("onHandUnits", snapshot.onHandUnits);
  const reserved = units("reservedUnits", snapshot.reservedUnits);
  const incoming = units("confirmedInboundUnits", snapshot.confirmedInboundUnits);
  const sold = units("soldLookbackUnits", snapshot.soldLookbackUnits);
  const lookback = days("lookbackDays", snapshot.lookbackDays, true);
  const lead = days("supplierLeadDays", snapshot.supplierLeadDays);
  const safety = days("safetyDays", snapshot.safetyDays);
  const cover = days("targetCoverageDays", snapshot.targetCoverageDays);
  const floor = units("minimumStockUnits", snapshot.minimumStockUnits);
  const minimum = units("minimumOrderUnits", snapshot.minimumOrderUnits);
  const multiple = units("orderMultipleUnits", snapshot.orderMultipleUnits, true);

  // Count only confirmed inbound; unapproved POs are intentionally excluded.
  const projected = onHand - reserved + incoming;
  const trigger = max(floor, ceilDiv(sold * (lead + safety), lookback));
  if (projected > trigger) return null;

  const target = max(floor, ceilDiv(sold * (lead + safety + cover), lookback));
  const shortfall = target - projected;
  if (shortfall <= 0n) return null;
  const proposed = max(shortfall, minimum);
  const order = ceilDiv(proposed, multiple) * multiple;

  return {
    kind: "draft_purchase_suggestion",
    orgId,
    branchId,
    productId,
    supplierId: preferredSupplierId,
    asOfDate,
    // The persistence adapter must enforce UNIQUE(org, branch, product, day).
    // Supplier may change between runs, but must not create duplicate drafts.
    dedupeKey: [orgId, branchId, productId, asOfDate].join(":"),
    projectedAvailableUnits: asSafeNumber(projected),
    triggerAtUnits: asSafeNumber(trigger),
    targetStockUnits: asSafeNumber(target),
    suggestedOrderUnits: asSafeNumber(order),
  };
}
