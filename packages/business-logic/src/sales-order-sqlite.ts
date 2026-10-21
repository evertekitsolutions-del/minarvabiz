/**
 * SAL-003: isolated offline SQLite transaction adapter for retail order intents.
 * Explicit opt-in only; intentionally NOT part of installed POS persistence.
 * SQL transactions are synchronous; caller owns trusted membership authority.
 */
import {
  planSalesOrderCreate,
  planSalesOrderTransition,
  type SalesOrderAuthorizedScope,
  type SalesOrderCreateRequest,
  type SalesOrderIntent,
  type SalesOrderTransitionRequest,
} from "./sales-order-intent";

export interface SalesOrderSqliteDb {
  exec(sql: string, params?: unknown[]): void;
  query(sql: string, params?: unknown[]): Record<string, unknown>[];
  transaction<T>(fn: () => T): T;
}
const table = "retail_sales_order_intents_v1";
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
    record_json TEXT NOT NULL CHECK(json_valid(record_json)),
    CHECK ((status = 'invoiced' AND invoice_id IS NOT NULL)
       OR (status <> 'invoiced' AND invoice_id IS NULL)),
    PRIMARY KEY (org_id, id),
    UNIQUE (org_id, operation_id),
    UNIQUE (org_id, company_id, order_number),
    UNIQUE (org_id, invoice_id)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sales_order_intents_branch
    ON ${table}(org_id, company_id, branch_id, status)`);
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
): { disposition: "new" | "replay"; order: SalesOrderIntent } {
  allowed(auth, enabled);
  return db.transaction(() => {
    const candidates = loadForKey(db, auth.organizationId, request);
    const plan = planSalesOrderCreate(request, auth, candidates, enabled);
    if (plan.disposition === "replay") return plan;
    const order = plan.order;
    db.exec(`INSERT INTO ${table} (id, org_id, company_id, branch_id, warehouse_id,
      operation_id, order_number, customer_id, status, version, invoice_id, record_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [order.id, order.organizationId, order.companyId, order.branchId, order.warehouseId,
        order.operationId, order.orderNumber, order.customerId, order.status,
        order.version, order.invoiceId, JSON.stringify(order)]);
    if (updatedRowCount(db) !== 1) throw new Error("Retail sales-order creation was not atomic");
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
): { disposition: "update" | "replay"; order: SalesOrderIntent } {
  allowed(auth, enabled);
  if (request.action === "link-invoice" && typeof verifyCommittedInvoice !== "function") {
    throw new Error("Trusted invoice verification required before linking a sales order");
  }
  return db.transaction(() => {
    const rows = db.query(`SELECT * FROM ${table} WHERE org_id = ? AND id = ?`,
      [auth.organizationId, orderId]);
    if (rows.length !== 1) throw new Error("Retail sales order not found or not authorized");
    const current = parse(rows[0]);
    const plan = planSalesOrderTransition(current, request, auth, enabled);
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
