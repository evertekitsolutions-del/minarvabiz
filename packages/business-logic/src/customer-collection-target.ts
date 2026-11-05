/** Fail-closed source-specific allocation preflight; shared collection journal remains authoritative. */
import { toMinorUnits, type MoneyMinor } from "@minarvabiz/utils";

export interface TargetedLaundryCollection { sourceType: "laundry"; id: string }
export interface TargetedServiceOrderCollection { sourceType: "service_order"; id: string }
export type TargetedCustomerCollection = TargetedLaundryCollection | TargetedServiceOrderCollection;

/** Select exactly one verified source to prevent cross-invoice or cross-order allocation. */
export function targetedCustomerCollectionError(
  target: TargetedCustomerCollection | undefined,
  candidates: readonly { id: string; balance: number; sourceType: string }[],
  amountMinor: MoneyMinor,
  customerOutstandingMinor: MoneyMinor,
): string | null {
  if (!target) return null;
  const label = target.sourceType === "laundry" ? "laundry ticket" : "service order";
  if ((target.sourceType !== "laundry" && target.sourceType !== "service_order")
    || !target.id || candidates.length !== 1 || candidates[0].id !== target.id
    || candidates[0].sourceType !== target.sourceType) {
    return `Selected ${label} has no collectible balance`;
  }
  try {
    const balanceMinor = toMinorUnits(candidates[0].balance);
    if (balanceMinor <= 0 || amountMinor <= 0 || amountMinor > balanceMinor
      || amountMinor > customerOutstandingMinor) {
      return `Payment cannot exceed the selected ${label} or customer outstanding balance`;
    }
  } catch {
    return `Selected ${label} balance needs reconciliation`;
  }
  return null;
}

/** Preserve the original laundry-specific preflight for existing callers. */
export function targetedLaundryCollectionError(
  target: TargetedLaundryCollection | undefined,
  candidates: readonly { id: string; balance: number }[],
  amountMinor: MoneyMinor,
  customerOutstandingMinor: MoneyMinor,
): string | null {
  return targetedCustomerCollectionError(target,
    candidates.map((item) => ({ ...item, sourceType: "laundry" })),
    amountMinor, customerOutstandingMinor);
}
