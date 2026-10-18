/**
 * UBP-03a: pure, presentation/validation-side inventory allocation rules.
 * Never use this output as proof of a committed allocation: authoritative
 * Postgres/SQLite transactions must recheck stock and lock relevant rows.
 */
export interface TrackedLot {
  readonly id: string;
  readonly orgId: string;
  readonly productId: string;
  readonly warehouseId: string;
  readonly batchCode: string;
  readonly expiresOn: string;
  readonly onHandMilli: number;
  readonly reservedMilli: number;
  readonly status: "active" | "blocked";
}
export interface LotSelectionRequest {
  readonly orgId: string;
  readonly productId: string;
  readonly warehouseId: string;
  readonly asOfDate: string;
  readonly quantityMilli: number;
  readonly lots: readonly TrackedLot[];
}
export interface LotAllocation {
  readonly batchId: string;
  readonly quantityMilli: number;
}
const validId = (id: unknown): id is string => typeof id === "string" && id.trim().length > 0;
const nonnegativeMilli = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;

/** ISO date-only values are interpreted as local shop business dates by callers. */
function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

/** Plan FEFO (first-expiring-first-out) allocations without changing stock. */
export function planFefoLotAllocations(request: LotSelectionRequest): readonly LotAllocation[] {
  const { orgId, productId, warehouseId, asOfDate, quantityMilli, lots } = request;
  if (![orgId, productId, warehouseId].every(validId) || !Array.isArray(lots)) {
    throw new Error("Invalid lot scope");
  }
  if (!isIsoDate(asOfDate)) throw new Error("Invalid sale date");
  if (!nonnegativeMilli(quantityMilli) || quantityMilli === 0) {
    throw new Error("Invalid quantity milli-units");
  }
  const seen = new Set<string>();
  for (const lot of lots) {
    if (!lot || lot.orgId !== orgId || lot.productId !== productId || lot.warehouseId !== warehouseId) {
      throw new Error("Lot scope mismatch");
    }
    if (!validId(lot.id) || !validId(lot.batchCode)) throw new Error("Invalid lot identity");
    if (seen.has(lot.id)) throw new Error("Duplicate lot id");
    seen.add(lot.id);
    if (lot.status !== "active" && lot.status !== "blocked") throw new Error("Invalid lot status");
    if (!isIsoDate(lot.expiresOn)) throw new Error("Invalid expiry date");
    if (!nonnegativeMilli(lot.onHandMilli) || !nonnegativeMilli(lot.reservedMilli) ||
        lot.reservedMilli > lot.onHandMilli) throw new Error("Invalid lot stock");
  }
  const saleable = lots.filter(lot => lot.status === "active" && lot.expiresOn >= asOfDate)
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.id.localeCompare(b.id));
  let remaining = quantityMilli;
  const allocations: LotAllocation[] = [];
  for (const lot of saleable) {
    const capacity = lot.onHandMilli - lot.reservedMilli;
    const allocated = Math.min(capacity, remaining);
    if (allocated > 0) allocations.push(Object.freeze({ batchId: lot.id, quantityMilli: allocated }));
    remaining -= allocated;
    if (remaining === 0) break;
  }
  if (remaining !== 0) throw new Error("Insufficient saleable lot stock");
  return Object.freeze(allocations);
}

export interface TrackedSerialUnit {
  readonly id: string;
  readonly orgId: string;
  readonly productId: string;
  readonly serialCode: string;
  readonly serialKind: "imei" | "serial";
  readonly status: "available" | "reserved" | "sold" | "blocked" | "returned";
}
export interface SerialSelectionRequest {
  readonly orgId: string;
  readonly productId: string;
  /** One serialized item = 1,000 milli-units. */
  readonly quantityMilli: number;
  readonly units: readonly TrackedSerialUnit[];
}
export interface SerialAllocation {
  readonly unitId: string;
  readonly serialCode: string;
}

/** Strict IMEI Luhn validation; arbitrary manufacturer serials are not IMEIs. */
function isValidImei(code: string): boolean {
  if (!/^\d{15}$/.test(code)) return false;
  const sum = [...code].reverse().reduce((total, c, index) => {
    let digit = Number(c);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    return total + digit;
  }, 0);
  return sum % 10 === 0;
}

export function normalizeSerialCode(value: string, kind: "imei" | "serial"): string {
  if (kind !== "imei" && kind !== "serial") throw new Error("Invalid serial kind");
  if (typeof value !== "string") throw new Error("Invalid serial code");
  const normalized = value.normalize("NFKC").trim().toUpperCase();
  if (kind === "imei") {
    if (!isValidImei(normalized)) throw new Error("Invalid IMEI");
    return normalized;
  }
  if (!/^[A-Z0-9][A-Z0-9 _./-]{0,127}$/.test(normalized)) throw new Error("Invalid serial code");
  return normalized;
}

/** Prepare 1-to-1 serial selection. Server must revalidate inside its stock transaction. */
export function validateSerializedSelection(request: SerialSelectionRequest): readonly SerialAllocation[] {
  const { orgId, productId, quantityMilli, units } = request;
  if (!validId(orgId) || !validId(productId) || !Array.isArray(units)) throw new Error("Invalid serial scope");
  if (!Number.isSafeInteger(quantityMilli) || quantityMilli <= 0 || quantityMilli % 1000 !== 0) {
    throw new Error("Serial quantity must contain whole units");
  }
  if (units.length !== quantityMilli / 1000) throw new Error("Serial quantity mismatch");
  const ids = new Set<string>();
  const codes = new Set<string>();
  const allocations: SerialAllocation[] = [];
  for (const unit of units) {
    if (!unit || unit.orgId !== orgId || unit.productId !== productId) throw new Error("Serial scope mismatch");
    if (!validId(unit.id)) throw new Error("Invalid serial id");
    if (ids.has(unit.id)) throw new Error("Duplicate serial id");
    ids.add(unit.id);
    if (unit.status !== "available") throw new Error("Serial unavailable");
    const code = normalizeSerialCode(unit.serialCode, unit.serialKind);
    if (codes.has(code)) throw new Error("Duplicate serial code");
    codes.add(code);
    allocations.push(Object.freeze({ unitId: unit.id, serialCode: code }));
  }
  return Object.freeze(allocations);
}
