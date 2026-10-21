/**
 * SAL-003: host-side, fail-closed reference checks against existing SQLite
 * customer and product masters. Does not reserve or decrement stock.
 *
 * Only instantiate from a trusted desktop authority boundary. The warehouse
 * proof must come from an authoritative, branch-scoped warehouse resolver;
 * this module does not treat renderer data or the order's own fields as proof.
 */
import type { SalesOrderIntent } from "./sales-order-intent";
import type { SalesOrderSqliteDb, VerifySalesOrderReferences } from "./sales-order-sqlite";

export interface SalesOrderWarehouseProofScope {
  readonly organizationId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly warehouseId: string;
}
export type VerifySalesOrderWarehouse = (
  db: SalesOrderSqliteDb, scope: SalesOrderWarehouseProofScope,
) => true;

export interface SalesOrderReferenceOptions {
  /** Default false: global/unassigned SKUs cannot bypass branch isolation. */
  readonly allowOrgSharedProducts?: boolean;
}

function exactlyOne(db: SalesOrderSqliteDb, sql: string, args: unknown[], name: string): void {
  const rows = db.query(sql, args);
  if (rows.length !== 1 || typeof rows[0]?.id !== "string") {
    throw new Error(`Active, branch-authorized sales-order ${name} not found`);
  }
}

/**
 * Construct once at the host authority boundary. A real SQLite transaction
 * must wrap this checker and its associated order write (adapter does so).
 */
export function createSalesOrderSqliteReferenceVerifier(
  warehouseProof: VerifySalesOrderWarehouse,
  options: SalesOrderReferenceOptions = {},
): VerifySalesOrderReferences {
  if (typeof warehouseProof !== "function") {
    throw new Error("Trusted warehouse authority verification required");
  }
  if (options.allowOrgSharedProducts !== undefined &&
      typeof options.allowOrgSharedProducts !== "boolean") {
    throw new Error("Invalid shared-product policy");
  }
  const allowShared = options.allowOrgSharedProducts === true;
  return (db, order: SalesOrderIntent) => {
    if (!order || !order.organizationId || !order.companyId ||
      !order.branchId || !order.warehouseId || !order.customerId ||
      !Array.isArray(order.lines) || order.lines.length === 0) {
      throw new Error("Invalid sales-order reference scope");
    }
    // An explicit true is the ONLY successful result. Never infer from
    // mere callback completion or a truthy non-boolean object.
    if (warehouseProof(db, {
      organizationId: order.organizationId,
      companyId: order.companyId,
      branchId: order.branchId,
      warehouseId: order.warehouseId,
    }) !== true) throw new Error("Sales-order warehouse authority denied");

    exactlyOne(db,
      "SELECT id FROM customers WHERE id = ? AND org_id = ? AND branch_id = ? AND deleted_at IS NULL",
      [order.customerId, order.organizationId, order.branchId], "customer");

    if (order.lines.length > 100) throw new Error("Sales order exceeds 100 SKU lines");
    const checked = new Set<string>();
    for (const line of order.lines) {
      if (!line || typeof line.productId !== "string" || !line.productId) {
        throw new Error("Invalid sales-order product identity");
      }
      if (checked.has(line.productId)) continue;
      checked.add(line.productId);
      const sql = allowShared
        ? "SELECT id FROM products WHERE id = ? AND org_id = ? AND (branch_id = ? OR branch_id IS NULL) AND is_active = 1 AND deleted_at IS NULL"
        : "SELECT id FROM products WHERE id = ? AND org_id = ? AND branch_id = ? AND is_active = 1 AND deleted_at IS NULL";
      exactlyOne(db, sql,
        [line.productId, order.organizationId, order.branchId], "product");
    }
    return true;
  };
}
