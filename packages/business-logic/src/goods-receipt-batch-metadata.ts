/**
 * PUR-004 / INV-005 — immutable GRN supplier batch provenance (local snapshot).
 * This is RECEIPT METADATA, not on-hand lot stock or a FEFO sale authority.
 */
export interface GoodsReceiptBatchMetadata {
  readonly batchCode: string;
  readonly expiresOn: string;
}
function isoDay(value: string): boolean {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
/** Return no metadata for ordinary/untracked receipts; reject partial pairs. */
export function validateGoodsReceiptBatchMetadata(input: {
  readonly batchCode?: string | null;
  readonly expiresOn?: string | null;
  readonly receiptDate: string;
  readonly productId?: string | null;
}): GoodsReceiptBatchMetadata | null {
  const batchCode = input.batchCode?.trim() ?? "";
  const expiresOn = input.expiresOn?.trim() ?? "";
  if (!batchCode && !expiresOn) return null;
  if (!input.productId) throw new Error("Batch tracking requires a linked product");
  if (!batchCode || !expiresOn) {
    throw new Error("Batch code and expiry date must both be supplied");
  }
  if (batchCode.length > 64 ||
    !/^[\p{L}\p{N}][\p{L}\p{N} ._\/-]*$/u.test(batchCode) ||
    /[\r\n\t]/.test(batchCode)) {
    throw new Error("Batch code must be 1–64 printable letters, numbers or safe separators");
  }
  if (!isoDay(input.receiptDate) || !isoDay(expiresOn)) {
    throw new Error("Receipt and expiry dates must be valid YYYY-MM-DD calendar dates");
  }
  if (expiresOn < input.receiptDate) {
    throw new Error("Expired goods cannot enter available GRN stock; quarantine separately");
  }
  return { batchCode, expiresOn };
}
