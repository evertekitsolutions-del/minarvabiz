/**
 * SAL-003: local-only cloud acknowledgement store (NOT a sender).
 * A receipt is not authoritative just because it has this TypeScript shape:
 * the host MUST synchronously revalidate it against a trusted authenticated
 * cloud result, signed proof, or an independently verified server receipt.
 * Never expose verifyAuthoritativeReceipt as a renderer callback.
 */
import type { SalesOrderAuthorizedScope } from "./sales-order-intent";
import type { SalesOrderPilotEvent, SalesOrderSqliteDb } from "./sales-order-sqlite";
import { listSalesOrderEventHistorySqlite } from "./sales-order-sqlite";
import { verifySalesOrderRecordIntegrity } from "./sales-order-record-integrity";

export interface SalesOrderCloudReceipt {
  readonly serverReceiptId: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly warehouseId: string;
  readonly orderId: string;
  readonly operationId: string;
  readonly orderVersion: number;
  readonly eventType: SalesOrderPilotEvent["eventType"];
  readonly receivedAt: string;
  /** Exact server-confirmed event, not just its identifier. */
  readonly event: SalesOrderPilotEvent;
}
export type VerifyAuthoritativeSalesOrderReceipt = (
  db: SalesOrderSqliteDb,
  receipt: SalesOrderCloudReceipt,
  localEvent: SalesOrderPilotEvent,
) => true;

const TABLE = "retail_sales_order_sync_receipts_v1";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SCOPE = ["organizationId","companyId","branchId","warehouseId"] as const;

function authorize(auth: SalesOrderAuthorizedScope, enabled: boolean): void {
  if (enabled !== true) throw new Error("SAL-003 sync acknowledgement disabled");
  if (!auth?.canManageSalesOrders) throw new Error("Sales-order sync acknowledgement permission denied");
}
function validTime(time: unknown): boolean {
  return typeof time === "string" && Number.isFinite(Date.parse(time)) &&
    new Date(time).toISOString() === time;
}
function matches(receipt: SalesOrderCloudReceipt, event: SalesOrderPilotEvent,
  auth: SalesOrderAuthorizedScope): void {
  if (!receipt || typeof receipt !== "object" || !UUID.test(receipt.serverReceiptId) ||
    !validTime(receipt.receivedAt) || !UUID.test(receipt.operationId) ||
    receipt.operationId !== event.operationId ||
    receipt.orderId !== event.orderId || receipt.orderVersion !== event.orderVersion ||
    receipt.eventType !== event.eventType || receipt.eventType !== event.eventType ||
    receipt.receivedAt < event.order.updatedAt ||
    JSON.stringify(receipt.event) !== JSON.stringify(event)) {
    throw new Error("Cloud receipt does not match local sales-order event");
  }
  for (const field of SCOPE) {
    if (receipt[field] !== auth[field] || event[field] !== auth[field]) {
      throw new Error("Cross-scope sales-order acknowledgement denied");
    }
  }
  verifySalesOrderRecordIntegrity(event.order);
}
/** Host-validates receipts for newly accepted and duplicate deliveries alike. */
export function acknowledgeSalesOrderCloudEventSqlite(
  db: SalesOrderSqliteDb,
  receipt: SalesOrderCloudReceipt,
  auth: SalesOrderAuthorizedScope,
  enabled = false,
  verifyAuthoritativeReceipt?: VerifyAuthoritativeSalesOrderReceipt,
): { disposition: "new" | "replay"; receipt: SalesOrderCloudReceipt } {
  authorize(auth, enabled);
  if (typeof verifyAuthoritativeReceipt !== "function") {
    throw new Error("Trusted cloud receipt verification required");
  }
  return db.transaction(() => {
    const events=listSalesOrderEventHistorySqlite(db,auth,enabled);
    const local=events.find((event)=>event.operationId===receipt?.operationId);
    if (!local) throw new Error("Local sales-order event missing for cloud receipt");
    matches(receipt,local,auth);
    if (verifyAuthoritativeReceipt(db,receipt,local)!==true) {
      throw new Error("Trusted cloud receipt verification denied");
    }
    const rows=db.query(`SELECT * FROM ${TABLE} WHERE org_id=? AND operation_id=?`,
      [auth.organizationId,receipt.operationId]);
    if (rows.length>0) {
      if (rows.length!==1 || rows[0].company_id!==auth.companyId ||
        rows[0].branch_id!==auth.branchId || rows[0].warehouse_id!==auth.warehouseId ||
        rows[0].order_id!==receipt.orderId ||
        rows[0].version!==receipt.orderVersion ||
        String(rows[0].receipt_json)!==JSON.stringify(receipt)) {
        throw new Error("Cloud receipt operation-key replay conflict");
      }
      return {disposition:"replay",receipt};
    }
    // Do not acknowledge revision N while earlier versions of this same order
    // remain unacknowledged, even if N arrived out of order from a server.
    const previous=events.filter(event=>event.orderId===receipt.orderId &&
      event.orderVersion < receipt.orderVersion);
    for (const event of previous) {
      const acknowledged=db.query(
        `SELECT operation_id FROM ${TABLE} WHERE org_id=? AND operation_id=?
          AND order_id=? AND version=?`,
        [auth.organizationId,event.operationId,event.orderId,event.orderVersion],
      );
      if (acknowledged.length!==1) {
        throw new Error("Cloud receipt cannot skip pending sales-order revisions");
      }
    }
    db.exec(`INSERT INTO ${TABLE}
      (org_id,company_id,branch_id,warehouse_id,order_id,operation_id,version,receipt_json)
      VALUES (?,?,?,?,?,?,?,?)`,
      [auth.organizationId,auth.companyId,auth.branchId,auth.warehouseId,
        receipt.orderId,receipt.operationId,receipt.orderVersion,JSON.stringify(receipt)]);
    const changes=db.query("SELECT changes() AS n")[0]?.n;
    if (changes!==1) throw new Error("Cloud acknowledgement commit failed");
    return {disposition:"new",receipt};
  });
}

/** Read-only, host-scoped receipts; backup needs these to preserve sync state. */
export function listSalesOrderCloudReceiptsSqlite(
  db: SalesOrderSqliteDb,
  auth: SalesOrderAuthorizedScope,
  enabled = false,
): SalesOrderCloudReceipt[] {
  authorize(auth,enabled);
  const events=listSalesOrderEventHistorySqlite(db,auth,enabled);
  const byOperation=new Map(events.map(event=>[event.operationId,event]));
  return db.query(`SELECT * FROM ${TABLE} WHERE org_id=? AND company_id=?
    AND branch_id=? AND warehouse_id=? ORDER BY order_id, version`,
    [auth.organizationId,auth.companyId,auth.branchId,auth.warehouseId])
    .map(row=>{
      let receipt: SalesOrderCloudReceipt;
      try { receipt=JSON.parse(String(row.receipt_json)) as SalesOrderCloudReceipt; }
      catch { throw new Error("Corrupt saved cloud receipt JSON"); }
      const event=byOperation.get(receipt?.operationId);
      if (!event || row.operation_id!==receipt.operationId ||
        row.order_id!==receipt.orderId || row.version!==receipt.orderVersion) {
        throw new Error("Corrupt saved cloud receipt identity");
      }
      matches(receipt,event,auth);
      return receipt;
    });
}
