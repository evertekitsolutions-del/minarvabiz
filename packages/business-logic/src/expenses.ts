import { fromMinorUnits, subtractMinorUnits, toMinorUnits } from "@minarvabiz/utils";
import { calculateLaundryProfit } from "./laundry";

export { calculateLaundryProfit };

export function purchaseBalance(amount: number, paidAmount: number) {
  const amountMinor = toMinorUnits(amount);
  const paidInputMinor = Math.max(0, toMinorUnits(paidAmount));
  const paidMinor = Math.min(paidInputMinor, amountMinor);
  const balanceMinor = Math.max(0, subtractMinorUnits(amountMinor, paidMinor));
  return {
    amount: fromMinorUnits(amountMinor),
    paidAmount: fromMinorUnits(paidMinor),
    balanceAmount: fromMinorUnits(balanceMinor),
  };
}

export function nextDocNumber(last: string | null, prefix: string): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const dateKey = `${y}${m}${d}`;
  let seq = 1;
  if (last) {
    const parts = last.split("-");
    const lastDate = parts.length >= 3 ? parts[1] : "";
    const n = parseInt(parts[parts.length - 1] ?? "0", 10);
    if (lastDate === dateKey && !Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}-${dateKey}-${String(seq).padStart(3, "0")}`;
}
