import { roundMoney } from "@minarvabiz/utils";
import { calculateLaundryProfit } from "./laundry";

export { calculateLaundryProfit };

export function purchaseBalance(amount: number, paidAmount: number) {
  const a = roundMoney(amount);
  const p = roundMoney(Math.max(0, paidAmount));
  return {
    amount: a,
    paidAmount: Math.min(p, a),
    balanceAmount: roundMoney(Math.max(0, a - p)),
  };
}

export function nextDocNumber(last: string | null, prefix: string): string {
  const y = new Date().getFullYear().toString().slice(-2);
  const m = String(new Date().getMonth() + 1).padStart(2, "0");
  const d = String(new Date().getDate()).padStart(2, "0");
  let seq = 1;
  if (last) {
    const parts = last.split("-");
    const n = parseInt(parts[parts.length - 1] ?? "0", 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}-${y}${m}${d}-${String(seq).padStart(3, "0")}`;
}
