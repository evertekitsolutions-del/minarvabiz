/**
 * SAL-003: fail-closed integrity checks for durable offline order records.
 * Detect malformed totals/versions/identity on SQLite read and before a future
 * backup/restore or sync serializer accepts customer financial data.
 * This is validation, not an authenticity signature or server permission.
 */
import type { SalesOrderIntent } from "./sales-order-intent";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = BigInt(Number.MAX_SAFE_INTEGER);
const props = ["organizationId","companyId","branchId","warehouseId",
  "id","operationId","customerId"] as const;
function id(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v) && v === v.toLowerCase();
}
function integer(v: unknown, positive = false): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) &&
    (positive ? v > 0 : v >= 0);
}
function timestamp(s: unknown): s is string {
  return typeof s === "string" && Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString() === s;
}
function invalid(reason: string): never {
  throw new Error("Corrupt retail sales-order record: " + reason);
}

export function verifySalesOrderRecordIntegrity(order: SalesOrderIntent): true {
  if (!order || typeof order !== "object" || Array.isArray(order)) invalid("not an object");
  for (const key of props) if (!id(order[key])) invalid(key + " must be a canonical UUID");
  if (!id(order.lastOperationId)) invalid("last operation ID");
  if (!integer(order.version, true)) invalid("version must be positive safe integer");
  if (!timestamp(order.createdAt) || !timestamp(order.updatedAt) ||
    order.updatedAt < order.createdAt) invalid("invalid timestamps");
  if (order.deletedAt != null && !timestamp(order.deletedAt)) invalid("deleted timestamp");
  if (typeof order.orderNumber !== "string" || !/^[A-Za-z0-9/_-]{1,48}$/.test(order.orderNumber)) invalid("order number");
  if (typeof order.currency !== "string" || !/^[A-Z]{3}$/.test(order.currency)) invalid("currency");
  if (order.note !== null && (typeof order.note !== "string" || order.note.length > 2000)) invalid("note");
  if (order.dueDate !== null && (typeof order.dueDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(order.dueDate) ||
    !Number.isFinite(Date.parse(order.dueDate + "T00:00:00.000Z")) ||
    new Date(order.dueDate + "T00:00:00.000Z").toISOString().slice(0,10) !== order.dueDate)) invalid("due date");
  if (!["draft","confirmed","cancelled","invoiced"].includes(order.status)) invalid("status");
  if ((order.status === "invoiced" && !id(order.invoiceId)) ||
    (order.status !== "invoiced" && order.invoiceId !== null)) invalid("invoice/status mismatch");
  if (!Array.isArray(order.lines) || order.lines.length < 1 || order.lines.length > 100) invalid("lines count");

  let subtotal = 0n, discount = 0n, tax = 0n;
  const lineIds = new Set<string>();
  for (const line of order.lines) {
    if (!line || !id(line.id) || !id(line.productId) ||
      typeof line.description !== "string" || !line.description.trim() ||
      line.description.trim() !== line.description ||
      line.description.length > 300 || lineIds.has(line.id)) invalid("line identity");
    lineIds.add(line.id);
    if (!integer(line.quantityMilli, true) || !integer(line.unitPriceMinor) ||
      !integer(line.discountMinor) || !integer(line.taxMinor) ||
      !integer(line.subtotalMinor) || !integer(line.totalMinor)) invalid("line money or quantity");
    const raw = BigInt(line.quantityMilli) * BigInt(line.unitPriceMinor);
    if (raw % 1000n !== 0n) invalid("fractional minor units");
    const lineSubtotal = raw / 1000n;
    const lineOff = BigInt(line.discountMinor);
    const lineTax = BigInt(line.taxMinor);
    const lineTotal = lineSubtotal - lineOff + lineTax;
    if (lineOff > lineSubtotal || lineTotal < 0n || lineTotal > MAX ||
      lineSubtotal > MAX || lineSubtotal !== BigInt(line.subtotalMinor) ||
      lineTotal !== BigInt(line.totalMinor)) invalid("line total mismatch");
    subtotal += lineSubtotal; discount += lineOff; tax += lineTax;
  }
  const total = subtotal - discount + tax;
  if ([subtotal,discount,tax,total].some(v => v < 0n || v > MAX) ||
    !integer(order.subtotalMinor) || !integer(order.discountMinor) ||
    !integer(order.taxMinor) || !integer(order.totalMinor) ||
    BigInt(order.subtotalMinor) !== subtotal ||
    BigInt(order.discountMinor) !== discount ||
    BigInt(order.taxMinor) !== tax ||
    BigInt(order.totalMinor) !== total) invalid("order total mismatch");

  if (typeof order.originalCreatePayload !== "string" ||
    order.originalCreatePayload.length < 2 ||
    order.originalCreatePayload.length > 131072) invalid("missing creation baseline");
  let initial: Record<string, unknown>;
  try { initial = JSON.parse(order.originalCreatePayload) as Record<string, unknown>; }
  catch { return invalid("invalid creation baseline"); }
  if (!initial || typeof initial !== "object" || Array.isArray(initial)) invalid("invalid baseline shape");
  for (const key of props) if (initial[key] !== order[key]) invalid("creation baseline scope mismatch");
  for (const key of ["orderNumber","currency","createdAt"] as const) {
    if (initial[key] !== order[key]) invalid("creation baseline identity mismatch");
  }
  if (!Array.isArray(initial.lines) || initial.lines.length < 1 ||
    initial.lines.length > 100) invalid("creation baseline missing lines");
  return true;
}
