import type { ReturnReason } from "@minarvabiz/types";

/**
 * Return stock disposition is an explicit cashier decision, independent of the
 * customer's refund value. Defective goods are not considered sellable by
 * default. An explicit per-item override remains in force when reason changes.
 */
export function resolveReturnRestock(
  reason: ReturnReason,
  itemDecision: boolean | undefined,
): boolean {
  return itemDecision ?? reason !== "defective";
}
