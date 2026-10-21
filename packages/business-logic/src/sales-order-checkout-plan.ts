/**
 * SAL-003 deterministic accounting/stock intent for confirmed retail orders.
 * Stock debit quantities for repeated product IDs are aggregated, never
 * duplicated per line. Pure command, not a stock/journal financial writer.
 */
import type { SalesOrderIntent } from "./sales-order-intent";
import { verifySalesOrderRecordIntegrity } from "./sales-order-record-integrity";

export interface SalesOrderCheckoutDebit {
  readonly productId: string;
  readonly quantityMilli: number;
}
export interface SalesOrderCheckoutLine {
  readonly lineId: string;
  readonly productId: string;
  readonly quantityMilli: number;
  readonly subtotalMinor: number;
  readonly discountMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
}
export interface SalesOrderCheckoutCommand {
  readonly orderId: string;
  readonly operationId: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly warehouseId: string;
  readonly customerId: string;
  readonly currency: string;
  readonly expectedVersion: number;
  readonly totalMinor: number;
  readonly lines: readonly SalesOrderCheckoutLine[];
  readonly stockDebits: readonly SalesOrderCheckoutDebit[];
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX = BigInt(Number.MAX_SAFE_INTEGER);
export function buildSalesOrderCheckoutCommand(
  order: SalesOrderIntent, operationId: string,
): SalesOrderCheckoutCommand {
  verifySalesOrderRecordIntegrity(order);
  if (order.status !== "confirmed") throw new Error("Only confirmed sales orders may be checked out");
  if (typeof operationId !== "string" || !UUID.test(operationId)) {
    throw new Error("Invalid sales-order checkout operation UUID");
  }
  const totals = new Map<string, bigint>();
  const lines = order.lines.map(line => {
    totals.set(line.productId, (totals.get(line.productId) ?? 0n) + BigInt(line.quantityMilli));
    return Object.freeze({
      lineId: line.id, productId: line.productId,
      quantityMilli: line.quantityMilli, subtotalMinor: line.subtotalMinor,
      discountMinor: line.discountMinor, taxMinor: line.taxMinor,
      totalMinor: line.totalMinor,
    });
  });
  const debits = [...totals.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([productId, quantity]) => {
    if (quantity <= 0n || quantity > MAX) throw new Error("Sales-order grouped stock quantity overflow");
    return Object.freeze({productId, quantityMilli:Number(quantity)});
  });
  return Object.freeze({
    orderId: order.id, operationId,
    organizationId: order.organizationId, companyId: order.companyId,
    branchId: order.branchId, warehouseId: order.warehouseId,
    customerId: order.customerId, currency: order.currency,
    expectedVersion: order.version, totalMinor: order.totalMinor,
    lines:Object.freeze(lines), stockDebits:Object.freeze(debits),
  });
}
