/**
 * Isolated SQLite transaction pilot for INV-017 kit reservations.
 *
 * This uses dedicated pilot tables and is NOT wired to the production POS,
 * Product.stockQuantity, WMS positions, domain snapshot or remote sync.
 * Never enable this writer for commercial checkout until one authoritative
 * stock ledger, authenticated ownership and financial atomicity are proven.
 */
import {
  planKitReservationCreate,
  planKitReservationFinalize,
  type KitReservationRecord,
  type KitReservationCreateRequest,
  type VersionedBundleLot,
  type KitReservationCreatePlan,
  type KitReservationFinalizePlan,
} from "./commerce-kit-reservation-transitions";

export interface KitSqliteTransactionDb {
  exec(sql: string, params?: unknown[]): void;
  query(sql: string, params?: unknown[]): Record<string, unknown>[];
  transaction<T>(fn: () => T): T;
}
export type AuthorizeKitWarehouse = (organizationId: string, warehouseId: string) => void;
export interface KitSqliteCreateInput
  extends Omit<KitReservationCreateRequest, "lots" | "existingReservation"> {
  /** Mandatory trusted, host-owned permission check; never renderer-supplied. */
  authorizeWarehouse: AuthorizeKitWarehouse;
}
export interface KitSqliteFinalizeInput {
  readonly orgId: string;
  readonly reservationId: string;
  readonly expectedVersion: number;
  readonly operation: "release" | "fulfill";
  readonly fulfillmentDate?: string;
  /** Mandatory trusted, host-owned permission check; never renderer-supplied. */
  readonly authorizeWarehouse: AuthorizeKitWarehouse;
  /**
   * Required for fulfillment; runs synchronous authorized financial SQL inside
   * the SAME transaction. A no-op callback is NOT an acceptable checkout.
   * Never call network, filesystem, timers or UI effects from this callback.
   */
  readonly commitFinancialEvent?: (db: KitSqliteTransactionDb, record: KitReservationRecord) => void;
}
const name = (s: unknown): s is string =>
  typeof s === "string" && s.trim().length > 0 && s === s.trim();
const safeVersion = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n > 0;
const changes = (db: KitSqliteTransactionDb): number =>
  Number(db.query("SELECT changes() AS affected")[0]?.affected ?? -1);

/** Explicit opt-in pilot schema; no production migration is applied. */
export function initializeKitReservationPilotSqlite(db: KitSqliteTransactionDb): void {
  db.exec(`CREATE TABLE IF NOT EXISTS kit_lot_pilot_v1 (
    org_id TEXT NOT NULL, warehouse_id TEXT NOT NULL, id TEXT NOT NULL,
    product_id TEXT NOT NULL, batch_code TEXT NOT NULL, expires_on TEXT NOT NULL,
    on_hand_milli INTEGER NOT NULL CHECK(on_hand_milli >= 0),
    reserved_milli INTEGER NOT NULL CHECK(reserved_milli >= 0 AND reserved_milli <= on_hand_milli),
    status TEXT NOT NULL CHECK(status IN ('active','blocked')),
    version INTEGER NOT NULL CHECK(version > 0),
    PRIMARY KEY(org_id, warehouse_id, id)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS kit_reservation_pilot_v1 (
    org_id TEXT NOT NULL, id TEXT NOT NULL, warehouse_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('reserved','released','fulfilled')),
    version INTEGER NOT NULL CHECK(version > 0),
    record_json TEXT NOT NULL,
    PRIMARY KEY(org_id, id)
  )`);
}

function getLots(
  db: KitSqliteTransactionDb,
  orgId: string,
  warehouseId: string,
  productIds: ReadonlySet<string>,
): VersionedBundleLot[] {
  const rows = db.query(
    `SELECT id, org_id, warehouse_id, product_id, batch_code, expires_on,
            on_hand_milli, reserved_milli, status, version
       FROM kit_lot_pilot_v1
      WHERE org_id = ? AND warehouse_id = ?
      ORDER BY product_id, id`,
    [orgId, warehouseId],
  );
  return rows.filter((row) => productIds.has(String(row.product_id))).map((row) => ({
    id: String(row.id), orgId: String(row.org_id),
    warehouseId: String(row.warehouse_id), productId: String(row.product_id),
    batchCode: String(row.batch_code), expiresOn: String(row.expires_on),
    onHandMilli: Number(row.on_hand_milli),
    reservedMilli: Number(row.reserved_milli),
    status: row.status as "active" | "blocked",
    version: Number(row.version),
  }));
}
function readReservation(db: KitSqliteTransactionDb, orgId: string, id: string):
  KitReservationRecord | null {
  const rows = db.query(
    "SELECT org_id, id, warehouse_id, status, version, record_json FROM kit_reservation_pilot_v1 WHERE org_id=? AND id=?",
    [orgId, id],
  );
  if (rows.length === 0) return null;
  if (rows.length !== 1) throw new Error("Duplicate persisted kit reservation");
  const row = rows[0];
  let parsed: KitReservationRecord;
  try { parsed = JSON.parse(String(row.record_json)) as KitReservationRecord; }
  catch { throw new Error("Corrupt persisted kit reservation JSON"); }
  if (!parsed || parsed.id !== row.id || parsed.orgId !== row.org_id ||
      parsed.warehouseId !== row.warehouse_id || parsed.status !== row.status ||
      parsed.version !== row.version || !Array.isArray(parsed.allocations) ||
      !Array.isArray(parsed.components)) {
    throw new Error("Persisted kit reservation identity or revision corrupted");
  }
  return parsed;
}
function applyLotPatches(
  db: KitSqliteTransactionDb,
  patches: readonly { lotId: string; expectedVersion: number; next: VersionedBundleLot }[],
  currentLots: readonly VersionedBundleLot[],
): void {
  const originals = new Map(currentLots.map((lot) => [lot.id, lot]));
  for (const change of patches) {
    const next = change.next;
    const original = originals.get(change.lotId);
    if (!original || original.version !== change.expectedVersion ||
        next.version !== change.expectedVersion + 1 ||
        next.id !== original.id || next.orgId !== original.orgId ||
        next.warehouseId !== original.warehouseId ||
        next.productId !== original.productId ||
        next.batchCode !== original.batchCode ||
        next.status !== original.status || next.expiresOn !== original.expiresOn) {
      throw new Error("Kit lot patch does not match locked source row");
    }
    db.exec(
      `UPDATE kit_lot_pilot_v1
          SET on_hand_milli=?, reserved_milli=?, version=?
        WHERE org_id=? AND warehouse_id=? AND id=? AND product_id=?
          AND version=? AND on_hand_milli=? AND reserved_milli=?
          AND batch_code=? AND status=? AND expires_on=?`,
      [next.onHandMilli, next.reservedMilli, next.version,
       next.orgId, next.warehouseId, change.lotId, next.productId,
       change.expectedVersion, original.onHandMilli, original.reservedMilli,
       original.batchCode, original.status, original.expiresOn],
    );
    if (changes(db) !== 1) throw new Error("Kit lot CAS conflict; transaction rolled back");
  }
}
function requireAuthorized(
  check: AuthorizeKitWarehouse,
  orgId: string,
  warehouseId: string,
): void {
  if (typeof check !== "function" || !name(orgId) || !name(warehouseId)) {
    throw new Error("Trusted kit warehouse authorization is required");
  }
  check(orgId, warehouseId);
}

/**
 * Opens ONE synchronous SQLite transaction, reading persisted lot versions
 * and existing idempotency reservation inside it. No renderer-provided stock
 * snapshot or 'existingReservation' is accepted.
 */
export function createKitReservationPilotSqlite(
  db: KitSqliteTransactionDb,
  input: KitSqliteCreateInput,
): KitReservationCreatePlan {
  if (!input || !name(input.reservationId) || !name(input.orgId) ||
      !name(input.warehouseId)) throw new Error("Invalid kit reservation identity");
  requireAuthorized(input.authorizeWarehouse, input.orgId, input.warehouseId);
  return db.transaction(() => {
    const existingReservation = readReservation(db, input.orgId, input.reservationId);
    const productIds = new Set((input.components ?? []).map((c) => c.productId));
    const lots = existingReservation ? [] : getLots(db, input.orgId, input.warehouseId, productIds);
    const plan = planKitReservationCreate({
      reservationId: input.reservationId, orgId: input.orgId,
      warehouseId: input.warehouseId, asOfDate: input.asOfDate,
      kitCount: input.kitCount, components: input.components,
      lots, existingReservation,
    });
    if (plan.disposition === "already_reserved") return plan;
    applyLotPatches(db, plan.lotPatches, lots);
    db.exec(
      `INSERT INTO kit_reservation_pilot_v1
       (org_id,id,warehouse_id,status,version,record_json) VALUES (?,?,?,?,?,?)`,
      [plan.reservation.orgId, plan.reservation.id, plan.reservation.warehouseId,
       plan.reservation.status, plan.reservation.version, JSON.stringify(plan.reservation)],
    );
    return plan;
  });
}
/** Release or fulfill using the persisted CAS reservation and lot rows. */
export function finalizeKitReservationPilotSqlite(
  db: KitSqliteTransactionDb,
  input: KitSqliteFinalizeInput,
): KitReservationFinalizePlan {
  if (!input || !name(input.orgId) || !name(input.reservationId) ||
      !safeVersion(input.expectedVersion)) throw new Error("Invalid kit transition identity");
  return db.transaction(() => {
    const reservation = readReservation(db, input.orgId, input.reservationId);
    if (!reservation) throw new Error("Kit reservation no longer exists");
    requireAuthorized(input.authorizeWarehouse, input.orgId, reservation.warehouseId);
    if (input.operation === "fulfill" && typeof input.commitFinancialEvent !== "function") {
      throw new Error("Kit fulfillment requires same-transaction financial writer");
    }
    const lots = getLots(db, reservation.orgId, reservation.warehouseId,
      new Set(reservation.components.map((c) => c.productId)));
    const plan = planKitReservationFinalize({
      reservation,
      expectedReservationVersion: input.expectedVersion,
      operation: input.operation, fulfillmentDate: input.fulfillmentDate,
      lots,
    });
    applyLotPatches(db, plan.lotPatches, lots);
    if (input.operation === "fulfill") {
      // Fail closed when the supplied callback is accidentally a no-op.
      // This does not prove accounting correctness; production integration
      // still requires a durable, unique financial event schema.
      const before = Number(db.query("SELECT total_changes() AS n")[0]?.n);
      input.commitFinancialEvent!(db, plan.reservation);
      const after = Number(db.query("SELECT total_changes() AS n")[0]?.n);
      if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after) || after <= before) {
        throw new Error("Kit fulfillment financial callback did not persist a SQL change");
      }
    }
    db.exec(
      `UPDATE kit_reservation_pilot_v1
          SET status=?, version=?, record_json=?
        WHERE org_id=? AND id=? AND warehouse_id=? AND status='reserved' AND version=?`,
      [plan.reservation.status, plan.reservation.version,
       JSON.stringify(plan.reservation), plan.reservation.orgId,
       plan.reservation.id, plan.reservation.warehouseId, plan.expectedReservationVersion],
    );
    if (changes(db) !== 1) throw new Error("Kit reservation CAS conflict; transaction rolled back");
    return plan;
  });
}
