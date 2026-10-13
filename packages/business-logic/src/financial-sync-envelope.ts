import type { DomainSnapshot } from "./persistence";
import type { FinancialSyncEnvelopeV1, FinancialSyncReceiptV1 } from "./financial-sync-contract";

/** S1 TDD placeholder — the first tests must fail before implementation. */
export function buildSaleFinancialEnvelope(
  _snapshot: DomainSnapshot, _eventId: string, _verifiedOwnerScope: string
): FinancialSyncEnvelopeV1 | { held: string } {
  return { held: "not_implemented" };
}
export function validateFinancialReceipt(
  _reply: unknown, _expected: FinancialSyncEnvelopeV1, _verifiedOwnerScope: string
): FinancialSyncReceiptV1 {
  throw new Error("not_implemented");
}
