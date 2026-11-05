/** Fail-closed source-specific allocation preflight; shared collection journal remains authoritative. */
import { toMinorUnits, type MoneyMinor } from "@minarvabiz/utils";

export interface TargetedLaundryCollection { sourceType: "laundry"; id: string }

/** Never redirect a ticket-specific customer receipt into an older sale or order. */
export function targetedLaundryCollectionError(
  target: TargetedLaundryCollection | undefined,
  candidates: readonly { id: string; balance: number }[],
  amountMinor: MoneyMinor,
  customerOutstandingMinor: MoneyMinor,
): string | null {
  if (!target) return null;
  if (target.sourceType !== "laundry" || !target.id
    || candidates.length !== 1 || candidates[0].id !== target.id) {
    return "Selected laundry ticket has no collectible balance";
  }
  try {
    const balanceMinor = toMinorUnits(candidates[0].balance);
    if (balanceMinor <= 0 || amountMinor <= 0 || amountMinor > balanceMinor
      || amountMinor > customerOutstandingMinor) {
      return "Payment cannot exceed the selected laundry or customer outstanding balance";
    }
  } catch {
    return "Selected laundry balance needs reconciliation";
  }
  return null;
}
