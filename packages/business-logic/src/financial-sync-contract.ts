/** S1: typed, fail-closed financial-sync schema; no network sender is enabled. */
export type FinancialSyncOperationV1 = "sale.post";
export interface FinancialSyncStockLineV1 {
  productId: string;
  quantity: number;
  expectedProductVersion: number;
  priorProductStock: number;
  resultingProductStock: number;
  expectedWarehouseVersion: number;
  priorOnHand: number;
  resultingOnHand: number;
  warehouseId: string;
  locationId: string;
}
export interface FinancialSyncProofV1 {
  schemaVersion: 1;
  branchId: string;
  warehouseId: string;
  locationId: string;
  currencyCode: string;
  currencyExponent: number;
  expectedVersions: Record<string, number>;
  stockLines: FinancialSyncStockLineV1[];
  paymentEventIds: string[];
  journalId: string;
}
export interface FinancialSyncEnvelopeV1 extends FinancialSyncProofV1 {
  eventId: string;
  organizationId: string;
  deviceId: string;
  operation: FinancialSyncOperationV1;
  sequence: number;
  occurredAt: string;
  sale: Record<string, unknown>;
  payments: Array<Record<string, unknown>>;
  accounts: Array<Record<string, unknown>>;
  journal: Record<string, unknown>;
}
export interface FinancialSyncReceiptV1 {
  accepted: true;
  replayed: boolean;
  eventId: string;
  organizationId: string;
  serverCursor: string;
  requestDigest: string;
  committedAt: string;
}
export type FinancialSyncApplyResultV1 =
  | FinancialSyncReceiptV1
  | { accepted: false; eventId: string; code: "version_conflict" | "stock_conflict" | "held_dependency"; reason: string };
