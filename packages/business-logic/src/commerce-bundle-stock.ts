/**
 * Aimeos-style multi-component bundle stock preview, built on Minarva's
 * existing offline-safe FEFO allocator. Original TypeScript implementation.
 *
 * This is NOT a reservation or proof of an authorized stock movement.
 * SQLite/Postgres writers must lock, re-read, and commit every source SKU
 * atomically with the checkout and idempotent financial event.
 */
import {
  planFefoLotAllocations, type TrackedLot, type LotAllocation,
} from "./tracked-inventory";

export interface CommerceBundleComponent {
  readonly productId: string;
  /** Quantity required per ONE bundle, already measured in exact milli-units. */
  readonly quantityMilliPerBundle: number;
}

export interface CommerceBundlePreflightInput {
  readonly orgId: string;
  readonly warehouseId: string;
  readonly asOfDate: string;
  /** Physical bundles are sold as whole kits in this first increment. */
  readonly bundleCount: number;
  readonly components: readonly CommerceBundleComponent[];
  /** Strictly scoped stock-lot rows from a trusted inventory read. */
  readonly lots: readonly TrackedLot[];
}

export interface CommerceBundleStockRequirement {
  readonly productId: string;
  readonly quantityMilli: number;
  readonly allocations: readonly LotAllocation[];
}

const validId = (s: unknown): s is string =>
  typeof s === "string" && s.trim().length > 0 && s.trim() === s;
const validMilli = (n: number) => Number.isSafeInteger(n) && n > 0;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Aggregate repeated SKU requirements BEFORE any FEFO allocation. Never
 * allocate each component independently: that can double-consume the same lot.
 * Returns all-or-throw (no partial plan on a later component's shortage).
 */
export function preflightCommerceBundleStock(
  request: CommerceBundlePreflightInput,
): readonly CommerceBundleStockRequirement[] {
  if (!request || !validId(request.orgId) || !validId(request.warehouseId) ||
      !Array.isArray(request.components) || !Array.isArray(request.lots)) {
    throw new Error("Invalid bundle inventory scope");
  }
  if (!Number.isSafeInteger(request.bundleCount) || request.bundleCount <= 0) {
    throw new Error("Bundle count must be a positive whole number");
  }
  if (request.components.length === 0) throw new Error("Bundle must contain components");
  const requiredByProduct = new Map<string, bigint>();
  for (const component of request.components) {
    if (!component || !validId(component.productId) ||
        !validMilli(component.quantityMilliPerBundle)) {
      throw new Error("Invalid bundle component or milli-unit quantity");
    }
    const required = BigInt(component.quantityMilliPerBundle) * BigInt(request.bundleCount);
    const total = (requiredByProduct.get(component.productId) ?? 0n) + required;
    if (total > MAX_SAFE) throw new Error("Bundle stock quantity exceeds safe integer range");
    requiredByProduct.set(component.productId, total);
  }

  // Reject untrusted out-of-scope lot rows instead of quietly mixing branches
  // or treating a wrong-warehouse stock position as available.
  const seenLotIds = new Set<string>();
  for (const lot of request.lots) {
    if (!lot || lot.orgId !== request.orgId || lot.warehouseId !== request.warehouseId ||
        !requiredByProduct.has(lot.productId)) {
      throw new Error("Bundle inventory lot scope mismatch");
    }
    if (!validId(lot.id) || seenLotIds.has(lot.id)) {
      throw new Error("Duplicate or invalid bundle lot identity");
    }
    seenLotIds.add(lot.id);
  }

  const result = [...requiredByProduct]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([productId, required]) => {
      const quantityMilli = Number(required);
      const allocations = planFefoLotAllocations({
        orgId: request.orgId,
        warehouseId: request.warehouseId,
        productId,
        asOfDate: request.asOfDate,
        quantityMilli,
        lots: request.lots.filter((lot) => lot.productId === productId),
      });
      return Object.freeze({
        productId,
        quantityMilli,
        allocations: Object.freeze([...allocations]),
      });
    });
  return Object.freeze(result);
}
