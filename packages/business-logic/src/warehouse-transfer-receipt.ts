/**
 * Universal warehouse transfer receipt preflight.
 * Pure, industry-neutral guard. No stock is mutated by this module.
 * A persistent transaction must lock the transfer revision and record the
 * idempotency key before applying inventory journal entries.
 */
export interface TransferReceiptScope {
  tenantId: string;
  companyId: string;
  destinationBranchId: string;
  destinationWarehouseId: string;
}
export interface TransferReceiptLine {
  lineId: string;
  skuId: string;
  dispatchedMinorUnits: number;
  previouslyReceivedMinorUnits: number;
  receiveMinorUnits: number;
}
export interface TransferReceiptRequest {
  scope: TransferReceiptScope;
  transferId: string;
  transferRevision: number;
  idempotencyKey: string;
  lines: readonly TransferReceiptLine[];
}
export interface TransferReceiptAuthority {
  scope: TransferReceiptScope;
  transferId: string;
  transferRevision: number;
  status: "dispatched" | "partially_received" | "received" | "cancelled";
  lines: readonly Omit<TransferReceiptLine, "receiveMinorUnits">[];
}
export type TransferReceiptDecision =
  | { ok: true; remainingMinorUnitsByLine: Readonly<Record<string, number>> }
  | { ok: false; reason: string };

const identifier = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 160 &&
  value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
const units = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export function validateWarehouseTransferReceipt(
  request: TransferReceiptRequest,
  authority: TransferReceiptAuthority,
): TransferReceiptDecision {
  if (!request || !authority || !request.scope || !authority.scope)
    return { ok: false, reason: "missing_scope" };
  for (const key of ["tenantId", "companyId", "destinationBranchId", "destinationWarehouseId"] as const) {
    if (!identifier(request.scope[key]) || request.scope[key] !== authority.scope[key])
      return { ok: false, reason: "scope_mismatch" };
  }
  if (!identifier(request.transferId) || request.transferId !== authority.transferId ||
      !identifier(request.idempotencyKey) || !units(request.transferRevision) ||
      request.transferRevision !== authority.transferRevision)
    return { ok: false, reason: "stale_or_invalid_request" };
  if (authority.status !== "dispatched" && authority.status !== "partially_received")
    return { ok: false, reason: "transfer_not_receivable" };
  if (!Array.isArray(request.lines) || !Array.isArray(authority.lines) ||
      request.lines.length === 0 || request.lines.length > 10000 ||
      request.lines.length !== authority.lines.length)
    return { ok: false, reason: "line_set_mismatch" };
  const trusted = new Map<string, TransferReceiptAuthority["lines"][number]>();
  for (const line of authority.lines) {
    if (!line || !identifier(line.lineId) || !identifier(line.skuId) ||
        !units(line.dispatchedMinorUnits) || !units(line.previouslyReceivedMinorUnits) ||
        line.previouslyReceivedMinorUnits > line.dispatchedMinorUnits ||
        trusted.has(line.lineId))
      return { ok: false, reason: "invalid_authority" };
    trusted.set(line.lineId, line);
  }
  const remaining: Record<string, number> = Object.create(null) as Record<string, number>;
  let receivedSomething = false;
  for (const line of request.lines) {
    if (!line || !identifier(line.lineId) || !identifier(line.skuId) ||
        !units(line.receiveMinorUnits) || !units(line.dispatchedMinorUnits) ||
        !units(line.previouslyReceivedMinorUnits) || own(remaining, line.lineId))
      return { ok: false, reason: "invalid_receipt_line" };
    const source = trusted.get(line.lineId);
    if (!source || source.skuId !== line.skuId ||
        source.dispatchedMinorUnits !== line.dispatchedMinorUnits ||
        source.previouslyReceivedMinorUnits !== line.previouslyReceivedMinorUnits ||
        line.receiveMinorUnits > source.dispatchedMinorUnits - source.previouslyReceivedMinorUnits)
      return { ok: false, reason: "quantity_or_line_mismatch" };
    remaining[line.lineId] = source.dispatchedMinorUnits -
      source.previouslyReceivedMinorUnits - line.receiveMinorUnits;
    receivedSomething ||= line.receiveMinorUnits > 0;
  }
  if (!receivedSomething) return { ok: false, reason: "empty_receipt" };
  return { ok: true, remainingMinorUnitsByLine: remaining };
}
