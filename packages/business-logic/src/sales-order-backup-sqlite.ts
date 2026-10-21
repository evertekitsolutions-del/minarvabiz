/**
 * SAL-003 isolated, opt-in offline backup/restore.
 * Does not modify the shipping domain snapshot or accept cloud acknowledgements.
 *
 * Restore is intentionally empty-scope-only: no destructive overwrite and no
 * silent merging of conflicting order revisions/pending sync envelopes.
 */
import type { SalesOrderAuthorizedScope, SalesOrderIntent } from "./sales-order-intent";
import type { SalesOrderSqliteDb, SalesOrderPilotEvent } from "./sales-order-sqlite";
import { listSalesOrdersSqlite, listPendingSalesOrderEventsSqlite } from "./sales-order-sqlite";
import { verifySalesOrderRecordIntegrity } from "./sales-order-record-integrity";

export interface SalesOrderPilotBackup {
  readonly schemaVersion: 1;
  readonly organizationId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly warehouseId: string;
  readonly orders: readonly SalesOrderIntent[];
  readonly pendingEvents: readonly SalesOrderPilotEvent[];
}
const ORDER_TABLE = "retail_sales_order_intents_v1";
const EVENT_TABLE = "retail_sales_order_pending_events_v1";
const scopeFields = ["organizationId", "companyId", "branchId", "warehouseId"] as const;

function authorized(auth: SalesOrderAuthorizedScope, enabled: boolean): void {
  if (enabled !== true) throw new Error("SAL-003 backup feature is disabled");
  if (!auth || auth.canManageSalesOrders !== true ||
    scopeFields.some((field) => typeof auth[field] !== "string" || !auth[field])) {
    throw new Error("Sales-order backup scope or authority denied");
  }
}
function sameScope(record: Record<string, unknown>, auth: SalesOrderAuthorizedScope): void {
  for (const field of scopeFields) {
    if (record[field] !== auth[field]) throw new Error("Cross-scope sales-order backup denied");
  }
}
function checkedEvent(e: SalesOrderPilotEvent, auth: SalesOrderAuthorizedScope): void {
  if (!e || typeof e !== "object") throw new Error("Invalid sales-order backup event");
  sameScope(e as unknown as Record<string, unknown>, auth);
  if (!e.order || e.order.id !== e.orderId || e.order.version !== e.orderVersion ||
    e.order.lastOperationId !== e.operationId ||
    e.operationId === "" || !Number.isSafeInteger(e.orderVersion) ||
    e.orderVersion < 1) throw new Error("Sales-order backup event mismatch");
  sameScope(e.order as unknown as Record<string, unknown>, auth);
  verifySalesOrderRecordIntegrity(e.order);
  const expectedStatus = ({
    created: "draft", amended: "draft", confirmed: "confirmed",
    cancelled: "cancelled", invoiced: "invoiced",
  } as Record<string, string>)[e.eventType];
  if (!expectedStatus || e.order.status !== expectedStatus ||
    (e.eventType === "created" && e.orderVersion !== 1) ||
    (e.eventType !== "created" && e.orderVersion === 1)) {
    throw new Error("Sales-order backup event transition mismatch");
  }
}
/** Returns scoped serializable records; the caller owns encryption/storage. */
export function exportSalesOrderPilotBackupSqlite(
  db: SalesOrderSqliteDb,
  auth: SalesOrderAuthorizedScope,
  enabled = false,
): SalesOrderPilotBackup {
  authorized(auth, enabled);
  const orders = listSalesOrdersSqlite(db, auth, enabled);
  const pendingEvents = listPendingSalesOrderEventsSqlite(db, auth, enabled);
  for (const order of orders) verifySalesOrderRecordIntegrity(order);
  for (const event of pendingEvents) checkedEvent(event, auth);
  return {
    schemaVersion: 1,
    organizationId: auth.organizationId,
    companyId: auth.companyId,
    branchId: auth.branchId,
    warehouseId: auth.warehouseId,
    orders, pendingEvents,
  };
}

/**
 * Restore from a previously verified host-owned snapshot into an initialized,
 * EMPTY scoped pilot. This never marks events synced or changes stock/payments.
 * Every insert and collision check is inside one SQLite transaction.
 */
export function restoreSalesOrderPilotBackupSqlite(
  db: SalesOrderSqliteDb,
  snapshot: unknown,
  auth: SalesOrderAuthorizedScope,
  enabled = false,
): { restoredOrders: number; restoredPendingEvents: number } {
  authorized(auth, enabled);
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("Invalid sales-order backup envelope");
  }
  const input = snapshot as Partial<SalesOrderPilotBackup>;
  if (input.schemaVersion !== 1) throw new Error("Unsupported sales-order backup version");
  sameScope(input as Record<string, unknown>, auth);
  if (!Array.isArray(input.orders) || !Array.isArray(input.pendingEvents) ||
    input.orders.length > 1000 || input.pendingEvents.length > 10000) {
    throw new Error("Invalid sales-order backup record count");
  }
  // Bounds apply before any SQL write and cap untrusted backup parsing work.
  if (new TextEncoder().encode(JSON.stringify(input)).length > 10 * 1024 * 1024) {
    throw new Error("Sales-order backup exceeds 10 MB pilot limit");
  }
  const orders = input.orders;
  const events = input.pendingEvents;
  const orderIds = new Set<string>(), operationIds = new Set<string>();
  const eventCount = new Map<string, number>();
  const lastEvents = new Map<string, SalesOrderPilotEvent>();
  for (const order of orders) {
    sameScope(order as unknown as Record<string, unknown>, auth);
    verifySalesOrderRecordIntegrity(order);
    if (orderIds.has(order.id)) throw new Error("Duplicate sales-order backup order");
    orderIds.add(order.id);
  }
  for (const event of events) {
    checkedEvent(event, auth);
    if (!orderIds.has(event.orderId)) throw new Error("Orphan sales-order backup event");
    if (operationIds.has(event.operationId)) throw new Error("Duplicate sales-order backup operation");
    operationIds.add(event.operationId);
    const seen = eventCount.get(event.orderId) ?? 0;
    if (event.orderVersion !== seen + 1) {
      throw new Error("Missing or out-of-order sales-order backup revision");
    }
    eventCount.set(event.orderId, seen + 1);
    lastEvents.set(event.orderId, event);
  }
  for (const order of orders) {
    const last = lastEvents.get(order.id);
    if (!last || last.orderVersion !== order.version ||
      last.operationId !== order.lastOperationId ||
      JSON.stringify(last.order) !== JSON.stringify(order)) {
      throw new Error("Sales-order backup does not match latest pending event");
    }
  }
  return db.transaction(() => {
    const scoped = [
      auth.organizationId, auth.companyId, auth.branchId, auth.warehouseId,
    ];
    const targetOrders = db.query(`SELECT id FROM ${ORDER_TABLE}
      WHERE org_id=? AND company_id=? AND branch_id=? AND warehouse_id=? LIMIT 1`, scoped);
    const targetEvents = db.query(`SELECT operation_id FROM ${EVENT_TABLE}
      WHERE org_id=? AND company_id=? AND branch_id=? AND warehouse_id=? LIMIT 1`, scoped);
    if (targetOrders.length !== 0 || targetEvents.length !== 0) {
      throw new Error("Sales-order backup restore requires an empty scoped destination");
    }
    for (const order of orders) {
      db.exec(`INSERT INTO ${ORDER_TABLE}
        (id,org_id,company_id,branch_id,warehouse_id,operation_id,order_number,
        customer_id,status,version,invoice_id,record_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [
        order.id,order.organizationId,order.companyId,order.branchId,
        order.warehouseId,order.operationId,order.orderNumber,order.customerId,
        order.status,order.version,order.invoiceId,JSON.stringify(order),
      ]);
    }
    for (const event of events) {
      db.exec(`INSERT INTO ${EVENT_TABLE}
        (org_id,company_id,branch_id,warehouse_id,order_id,operation_id,
        version,event_type,payload_json,status) VALUES (?,?,?,?,?,?,?,?,?,'pending')`, [
        event.organizationId,event.companyId,event.branchId,event.warehouseId,
        event.orderId,event.operationId,event.orderVersion,event.eventType,
        JSON.stringify(event),
      ]);
    }
    return { restoredOrders: orders.length, restoredPendingEvents: events.length };
  });
}
