/**
 * SAL-003: isolated offline SQLite transaction adapter for retail order intents.
 * Explicit opt-in only; intentionally NOT part of installed POS persistence.
 * SQL transactions are synchronous; caller owns trusted membership authority.
 */
import {
  planSalesOrderCreate,
  planSalesOrderTransition,
  planSalesOrderDraftAmend,
  type SalesOrderAuthorizedScope,
  type SalesOrderCreateRequest,
  type SalesOrderDraftAmendRequest,
  type SalesOrderIntent,
  type SalesOrderTransitionRequest,
} from "./sales-order-intent";
import { verifySalesOrderRecordIntegrity } from "./sales-order-record-integrity";
import { buildSalesOrderCheckoutCommand, type SalesOrderCheckoutCommand } from "./sales-order-checkout-plan";

/** Trusted host callback: must confirm customer, product and warehouse masters. */
export type VerifySalesOrderReferences = (db: SalesOrderSqliteDb, order: SalesOrderIntent) => true;

export interface SalesOrderSqliteDb {
  exec(sql: string, params?: unknown[]): void;
  query(sql: string, params?: unknown[]): Record<string, unknown>[];
  transaction<T>(fn: () => T): T;
}
const table = "retail_sales_order_intents_v1";
const eventTable = "retail_sales_order_pending_events_v1";
export type SalesOrderPilotEventType = "created" | "amended" | "confirmed" | "cancelled" | "invoiced";
export interface SalesOrderPilotEvent {
  readonly operationId: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly warehouseId: string;
  readonly orderId: string;
  readonly orderVersion: number;
  readonly eventType: SalesOrderPilotEventType;
  readonly order: SalesOrderIntent;
}
/** Durable local staging only, NOT a cloud-sync acknowledgement or financial envelope. */
function stagePilotEvent(db: SalesOrderSqliteDb, order: SalesOrderIntent, kind: SalesOrderPilotEventType): void {
  const record: SalesOrderPilotEvent = {
    operationId: order.lastOperationId, organizationId: order.organizationId,
    companyId: order.companyId, branchId: order.branchId, warehouseId: order.warehouseId,
    orderId: order.id, orderVersion: order.version, eventType: kind, order,
  };
  db.exec(`INSERT INTO ${eventTable}
    (org_id, company_id, branch_id, warehouse_id, order_id,
     operation_id, version, event_type, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [record.organizationId, record.companyId, record.branchId, record.warehouseId,
      record.orderId, record.operationId, record.orderVersion, kind, JSON.stringify(record)]);
  if (updatedRowCount(db) !== 1) throw new Error("Sales-order event was not stored with its local mutation");
}

function allowed(auth: SalesOrderAuthorizedScope, enabled: boolean): void {
  if (enabled !== true) throw new Error("SAL-003 feature is disabled");
  if (!auth?.canManageSalesOrders) throw new Error("Sales-order permission denied");
}
function updatedRowCount(db: SalesOrderSqliteDb): number {
  const row = db.query("SELECT changes() AS count")[0];
  const count = Number(row?.count);
  if (!Number.isSafeInteger(count)) throw new Error("SQLite changes() unavailable");
  return count;
}
export function initializeSalesOrderSqlite(db: SalesOrderSqliteDb, enabled = false): void {
  if (enabled !== true) throw new Error("SAL-003 feature is disabled");
  db.exec(`CREATE TABLE IF NOT EXISTS ${table} (
    id TEXT NOT NULL, org_id TEXT NOT NULL,
    company_id TEXT NOT NULL, branch_id TEXT NOT NULL,
    warehouse_id TEXT NOT NULL, operation_id TEXT NOT NULL,
    order_number TEXT NOT NULL, customer_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('draft','confirmed','cancelled','invoiced')),
    version INTEGER NOT NULL CHECK(version > 0),
    invoice_id TEXT,
    record_json TEXT NOT NULL CHECK(json_valid(record_json)
      AND length(CAST(record_json AS BLOB)) <= 131072),
    CHECK ((status = 'invoiced' AND invoice_id IS NOT NULL)
       OR (status <> 'invoiced' AND invoice_id IS NULL)),
    PRIMARY KEY (org_id, id),
    UNIQUE (org_id, operation_id),
    UNIQUE (org_id, company_id, order_number),
    UNIQUE (org_id, invoice_id)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_order_intents_branch
    ON ${table}(org_id, company_id, branch_id, status)`);
  db.exec(`CREATE TABLE IF NOT EXISTS ${eventTable} (
    org_id TEXT NOT NULL, company_id TEXT NOT NULL,
    branch_id TEXT NOT NULL, warehouse_id TEXT NOT NULL,
    order_id TEXT NOT NULL, operation_id TEXT NOT NULL,
    version INTEGER NOT NULL CHECK(version > 0),
    event_type TEXT NOT NULL
      CHECK(event_type IN ('created','amended','confirmed','cancelled','invoiced')),
    payload_json TEXT NOT NULL CHECK(
      json_valid(payload_json) AND length(CAST(payload_json AS BLOB)) <= 262144),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status = 'pending'),
    PRIMARY KEY (org_id, operation_id),
    UNIQUE (org_id, order_id, version)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_order_pending_by_scope
    ON ${eventTable}(org_id,company_id,branch_id,warehouse_id,order_id,version)`);
}
/** Fail closed if record JSON and indexed authority columns ever disagree. */
function parse(row: Record<string, unknown>): SalesOrderIntent {
  let record: SalesOrderIntent;
  try { record = JSON.parse(String(row.record_json)); }
  catch { throw new Error("Corrupt retail sales-order record"); }
  if (!record || typeof record !== "object" || Array.isArray(record) ||
    record.id !== row.id || record.organizationId !== row.org_id ||
    record.companyId !== row.company_id || record.branchId !== row.branch_id ||
    record.warehouseId !== row.warehouse_id || record.operationId !== row.operation_id ||
    record.customerId !== row.customer_id || record.orderNumber !== row.order_number ||
    record.version !== row.version || record.status !== row.status ||
    record.invoiceId !== row.invoice_id || !Array.isArray(record.lines)) {
    throw new Error("Retail sales-order stored identity or revision mismatch");
  }
  verifySalesOrderRecordIntegrity(record);
  return record;
}
function loadForKey(
  db: SalesOrderSqliteDb, orgId: string, req: SalesOrderCreateRequest,
): SalesOrderIntent[] {
  return db.query(`SELECT * FROM ${table}
    WHERE org_id = ? AND (operation_id = ? OR id = ? OR (company_id = ? AND order_number = ?))`,
    [orgId, req.operationId, req.id, req.companyId, req.orderNumber]).map(parse);
}
export function createSalesOrderSqlite(
  db: SalesOrderSqliteDb,
  request: SalesOrderCreateRequest,
  auth: SalesOrderAuthorizedScope,
  enabled = false,
  verifyReferences?: VerifySalesOrderReferences,
): { disposition: "new" | "replay"; order: SalesOrderIntent } {
  allowed(auth, enabled);
  if (typeof verifyReferences !== "function") {
    throw new Error("Trusted customer/product/warehouse reference verification required");
  }
  return db.transaction(() => {
    const candidates = loadForKey(db, auth.organizationId, request);
    const plan = planSalesOrderCreate(request, auth, candidates, enabled);
    if (plan.disposition === "replay") return plan;
    const order = plan.order;
    if (verifyReferences!(db, order) !== true) {
      throw new Error("Trusted customer/product/warehouse reference verification denied");
    }
    db.exec(`INSERT INTO ${table} (id, org_id, company_id, branch_id, warehouse_id,
      operation_id, order_number, customer_id, status, version, invoice_id, record_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [order.id, order.organizationId, order.companyId, order.branchId, order.warehouseId,
        order.operationId, order.orderNumber, order.customerId, order.status,
        order.version, order.invoiceId, JSON.stringify(order)]);
    if (updatedRowCount(db) !== 1) throw new Error("Retail sales-order creation was not atomic");
    stagePilotEvent(db, order, "created");
    return plan;
  });
}
export function transitionSalesOrderSqlite(
  db: SalesOrderSqliteDb,
  orderId: string,
  request: SalesOrderTransitionRequest,
  auth: SalesOrderAuthorizedScope,
  enabled = false,
  /** Host-only callback must look up a previously committed authoritative invoice. */
  verifyCommittedInvoice?: (invoiceId: string, order: SalesOrderIntent) => boolean,
  /** Host-owned verification, including product availability, required for confirmation. */
  verifyReferences?: VerifySalesOrderReferences,
): { disposition: "update" | "replay"; order: SalesOrderIntent } {
  allowed(auth, enabled);
  if (request.action === "link-invoice" && typeof verifyCommittedInvoice !== "function") {
    throw new Error("Trusted invoice verification required before linking a sales order");
  }
  if (request.action === "confirm" && typeof verifyReferences !== "function") {
    throw new Error("Trusted sales-order reference verification required before confirmation");
  }
  return db.transaction(() => {
    const rows = db.query(`SELECT * FROM ${table} WHERE org_id = ? AND id = ?`,
      [auth.organizationId, orderId]);
    if (rows.length !== 1) throw new Error("Retail sales order not found or not authorized");
    const current = parse(rows[0]);
    const plan = planSalesOrderTransition(current, request, auth, enabled);
    if (request.action === "confirm" && verifyReferences!(db, plan.order) !== true) {
      throw new Error("Trusted sales-order reference verification denied confirmation");
    }
    if (request.action === "link-invoice") {
      const invoiceId = plan.order.invoiceId;
      if (!invoiceId || !verifyCommittedInvoice!(invoiceId, current)) {
        throw new Error("Trusted committed invoice verification failed");
      }
    }
    if (plan.disposition === "replay") return plan;
    const next = plan.order;
    db.exec(`UPDATE ${table}
      SET status = ?, version = ?, invoice_id = ?, record_json = ?
      WHERE org_id = ? AND id = ? AND company_id = ? AND branch_id = ?
      AND warehouse_id = ? AND version = ?`,
    [next.status, next.version, next.invoiceId, JSON.stringify(next),
      next.organizationId, next.id, next.companyId, next.branchId,
      next.warehouseId, current.version]);
    if (updatedRowCount(db) !== 1) throw new Error("Retail sales-order optimistic revision conflict");
    stagePilotEvent(db, next, next.status === "invoiced" ? "invoiced" :
      next.status === "cancelled" ? "cancelled" : "confirmed");
    return plan;
  });
}
/** Read-only scoped access for future Web/Desktop UI; host-owned authorization only. */
export function listSalesOrdersSqlite(
  db: SalesOrderSqliteDb,
  auth: SalesOrderAuthorizedScope,
  enabled = false,
): SalesOrderIntent[] {
  allowed(auth, enabled);
  return db.query(`SELECT * FROM ${table} WHERE org_id = ? AND company_id = ?
    AND branch_id = ? AND warehouse_id = ? ORDER BY order_number, id`,
    [auth.organizationId, auth.companyId, auth.branchId, auth.warehouseId]).map(parse);
}

/**
 * Atomic replacement of draft lines and totals. Invoiced/confirmed orders
 * are immutable: correction must go through approved downstream workflows.
 */
export function amendSalesOrderSqlite(
  db: SalesOrderSqliteDb,
  orderId: string,
  request: SalesOrderDraftAmendRequest,
  auth: SalesOrderAuthorizedScope,
  enabled = false,
  verifyReferences?: VerifySalesOrderReferences,
): { disposition: "update" | "replay"; order: SalesOrderIntent } {
  allowed(auth, enabled);
  if (typeof verifyReferences !== "function") {
    throw new Error("Trusted customer/product/warehouse reference verification required");
  }
  return db.transaction(() => {
    const rows = db.query(`SELECT * FROM ${table} WHERE org_id = ? AND id = ?`,
      [auth.organizationId, orderId]);
    if (rows.length !== 1) throw new Error("Retail sales order not found or not authorized");
    const current = parse(rows[0]);
    const plan = planSalesOrderDraftAmend(current, request, auth, enabled);
    if (plan.disposition === "replay") return plan;
    const next = plan.order;
    if (verifyReferences!(db, next) !== true) {
      throw new Error("Trusted customer/product/warehouse reference verification denied");
    }
    db.exec(`UPDATE ${table} SET version = ?, record_json = ?
      WHERE org_id = ? AND id = ? AND company_id = ? AND branch_id = ?
      AND warehouse_id = ? AND version = ? AND status = 'draft'`,
      [next.version, JSON.stringify(next), next.organizationId, next.id,
        next.companyId, next.branchId, next.warehouseId, current.version]);
    if (updatedRowCount(db) !== 1) throw new Error("Retail sales-order optimistic revision conflict");
    stagePilotEvent(db, next, "amended");
    return plan;
  });
}

/**
 * Scope-restricted, read-only local event staging.
 * No ack/send/discard methods exist: future trusted sync needs signed replay
 * proof and a separate authoritative cloud writer.
 */
export function listPendingSalesOrderEventsSqlite(
  db: SalesOrderSqliteDb,
  auth: SalesOrderAuthorizedScope,
  enabled = false,
): SalesOrderPilotEvent[] {
  allowed(auth, enabled);
  const rows = db.query(`SELECT * FROM ${eventTable}
    WHERE org_id = ? AND company_id = ? AND branch_id = ? AND warehouse_id = ?
      AND status = 'pending'
    ORDER BY order_id, version`,
    [auth.organizationId, auth.companyId, auth.branchId, auth.warehouseId]);
  return rows.map((row) => {
    let event: SalesOrderPilotEvent;
    try { event = JSON.parse(String(row.payload_json)); }
    catch { throw new Error("Corrupt sales-order pending event JSON"); }
    if (!event || event.organizationId !== row.org_id ||
      event.companyId !== row.company_id || event.branchId !== row.branch_id ||
      event.warehouseId !== row.warehouse_id || event.orderId !== row.order_id ||
      event.operationId !== row.operation_id || event.orderVersion !== row.version ||
      event.eventType !== row.event_type ||
      event.order?.id !== event.orderId || event.order?.version !== event.orderVersion ||
      event.order?.organizationId !== event.organizationId ||
      event.order?.companyId !== event.companyId ||
      event.order?.branchId !== event.branchId ||
      event.order?.warehouseId !== event.warehouseId ||
      event.order?.lastOperationId !== event.operationId) {
      throw new Error("Sales-order pending event identity/revision mismatch");
    }
    // The pending event will eventually become a financial sync source.
    // Refuse tampered line totals even if its indexed scope/version still match.
    verifySalesOrderRecordIntegrity(event.order);
    return event;
  });
}

/**
 * SAL-003 isolated atomic order -> invoice coordinator.
 *
 * HOST TRUST BOUNDARY: callbacks MUST be created in a privileged trusted host,
 * NEVER passed from renderer/HTTP payload. commitFinancialSale must synchronously
 * write the invoice, stock movement, payment/journal and every side effect
 * through the supplied SQLite connection in this SAME transaction. The receipt
 * reader must query that committed invoice from the same connection.
 *
 * This deliberately is NOT mounted in the shipping POS. It neither implements
 * nor pretends to be an authoritative financial writer by itself.
 */
export interface SalesOrderFinancialReceipt {
  readonly id: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly customerId: string;
  readonly currency: string;
  readonly totalMinor: number;
}
export interface SalesOrderCheckoutHost {
  readonly commitFinancialSale: (
    db: SalesOrderSqliteDb, order: SalesOrderIntent, operationId: string,
    command: SalesOrderCheckoutCommand,
  ) => void;
  readonly readCommittedInvoice: (
    db: SalesOrderSqliteDb, operationId: string,
  ) => SalesOrderFinancialReceipt | null;
}
export interface SalesOrderCheckoutRequest {
  readonly operationId: string;
  readonly expectedVersion: number;
  readonly occurredAt: string;
}
export function checkoutSalesOrderSqlite(
  db: SalesOrderSqliteDb,
  orderId: string,
  request: SalesOrderCheckoutRequest,
  auth: SalesOrderAuthorizedScope,
  enabled = false,
  host?: SalesOrderCheckoutHost,
): { disposition: "update" | "replay"; order: SalesOrderIntent } {
  allowed(auth, enabled);
  if (typeof host?.commitFinancialSale !== "function" ||
    typeof host?.readCommittedInvoice !== "function") {
    throw new Error("Trusted transactional financial writer and receipt reader required");
  }
  return db.transaction(() => {
    const rows = db.query(`SELECT * FROM ${table} WHERE org_id = ? AND id = ?`,
      [auth.organizationId, orderId]);
    if (rows.length !== 1) throw new Error("Retail sales order not found or not authorized");
    const current = parse(rows[0]);
    // Scope must come from host-verified authority before reading/writing money.
    for (const field of ["organizationId", "companyId", "branchId", "warehouseId"] as const) {
      if (auth[field] !== current[field]) throw new Error("Sales-order checkout scope mismatch");
    }
    const key = request?.operationId;
    const replay = current.status === "invoiced" && current.lastOperationId === key;
    if (!replay) {
      // Preflight validates CAS, allowed transition and timestamp BEFORE running
      // the privileged financial writer. No side effects on a rejected request.
      const temporaryId = current.id === "00000000-0000-4000-8000-000000000001"
        ? "00000000-0000-4000-8000-000000000002"
        : "00000000-0000-4000-8000-000000000001";
      planSalesOrderTransition(current, {
        ...request, action: "link-invoice",
        committedInvoice: {
          id: temporaryId,
          organizationId: current.organizationId, companyId: current.companyId,
          branchId: current.branchId, customerId: current.customerId,
          currency: current.currency, totalMinor: current.totalMinor,
        },
      }, auth, enabled);
      const command = buildSalesOrderCheckoutCommand(current, key);
      const callbackResult: unknown = host.commitFinancialSale(db, current, key, command);
      if (callbackResult !== undefined) {
        throw new Error("Financial writer must be synchronous and return no value");
      }
    }
    // A caller-provided invoice descriptor never proves an actual financial
    // commit. Always read the saved receipt using the trusted host's reader.
    const receipt = host.readCommittedInvoice(db, key);
    if (!receipt) throw new Error("No authoritative committed invoice for sales order");
    // Replay must re-verify ALL attributes, not just the invoice ID.
    // The pure transition planner intentionally short-circuits same-key
    // replays, so the trusted writer boundary must detect stale/mutated money.
    if (replay && (receipt.id?.toLowerCase() !== current.invoiceId ||
      receipt.organizationId !== current.organizationId ||
      receipt.companyId !== current.companyId ||
      receipt.branchId !== current.branchId ||
      receipt.customerId !== current.customerId ||
      receipt.currency !== current.currency ||
      receipt.totalMinor !== current.totalMinor)) {
      throw new Error("Committed invoice replay proof does not match the sales order");
    }
    const plan = planSalesOrderTransition(current, {
      ...request, action: "link-invoice", committedInvoice: receipt,
    }, auth, enabled);
    if (plan.disposition === "replay") return plan;
    const next = plan.order;
    db.exec(`UPDATE ${table}
      SET status = ?, version = ?, invoice_id = ?, record_json = ?
      WHERE org_id = ? AND id = ? AND company_id = ? AND branch_id = ?
        AND warehouse_id = ? AND version = ? AND status = 'confirmed'`,
      [next.status, next.version, next.invoiceId, JSON.stringify(next),
        next.organizationId, next.id, next.companyId, next.branchId,
        next.warehouseId, current.version]);
    if (updatedRowCount(db) !== 1) {
      throw new Error("Sales-order checkout CAS failed: financial transaction rolled back");
    }
    stagePilotEvent(db, next, "invoiced");
    return plan;
  });
}

/** Tenant/branch-scoped, stable cursor pagination for future host UI. */
export interface SalesOrderCursor {
  readonly orderNumber: string;
  readonly id: string;
}
export interface SalesOrderPageOptions {
  readonly limit?: number;
  readonly status?: "draft" | "confirmed" | "cancelled" | "invoiced";
  readonly after?: SalesOrderCursor | null;
}
export function listSalesOrdersPageSqlite(
  db: SalesOrderSqliteDb,
  auth: SalesOrderAuthorizedScope,
  options: SalesOrderPageOptions = {},
  enabled = false,
): { orders: SalesOrderIntent[]; nextCursor: SalesOrderCursor | null } {
  allowed(auth, enabled);
  const limit = options.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid sales-order page size (1 to 100)");
  }
  const valid = ["draft","confirmed","cancelled","invoiced"];
  if (options.status != null && !valid.includes(options.status)) {
    throw new Error("Invalid sales-order page status");
  }
  const after = options.after;
  if (after != null && (typeof after.orderNumber !== "string" ||
    !/^[A-Za-z0-9/_-]{1,48}$/.test(after.orderNumber) ||
    typeof after.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(after.id))) {
    throw new Error("Invalid sales-order page cursor");
  }
  const params: unknown[] = [
    auth.organizationId, auth.companyId, auth.branchId, auth.warehouseId,
  ];
  let query = `SELECT * FROM ${table} WHERE org_id = ? AND company_id = ?
    AND branch_id = ? AND warehouse_id = ?`;
  if (options.status != null) {
    query += " AND status = ?";
    params.push(options.status);
  }
  if (after != null) {
    query += " AND (order_number > ? OR (order_number = ? AND id > ?))";
    params.push(after.orderNumber, after.orderNumber, after.id);
  }
  query += " ORDER BY order_number ASC, id ASC LIMIT ?";
  params.push(limit + 1);
  const rows = db.query(query, params);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).map(parse);
  const last = hasMore ? page[page.length - 1] : undefined;
  return { orders: page, nextCursor: last ? {orderNumber:last.orderNumber,id:last.id} : null };
}
