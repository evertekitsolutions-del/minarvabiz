import type { UUID } from "@minarvabiz/types";
import * as phase5 from "./phase5-store";
import { listPurchaseReturns } from "./purchase-returns";

export interface SupplierStatement {
  supplierId: UUID;
  supplierName: string;
  totalPurchases: number;
  totalPaid: number;
  totalReturns: number;
  outstanding: number;
  lines: Array<{ date: string; type: string; amount: number; notes: string }>;
}

export function buildSupplierStatement(supplierId: UUID): SupplierStatement | null {
  const sup = phase5.listSuppliers().find((s) => s.id === supplierId);
  if (!sup) return null;
  const purchases = phase5.listPurchases().filter((p) => p.supplierId === supplierId);
  const returns = listPurchaseReturns().filter((r) => r.supplierId === supplierId);
  let totalPurchases = 0;
  let totalPaid = 0;
  const lines: SupplierStatement["lines"] = [];
  for (const p of purchases) {
    totalPurchases += p.amount;
    totalPaid += p.paidAmount;
    lines.push({ date: p.date, type: "purchase", amount: p.amount, notes: p.purchaseNumber || p.id });
  }
  let totalReturns = 0;
  for (const r of returns) {
    totalReturns += r.amount;
    lines.push({ date: r.createdAt.slice(0, 10), type: "return", amount: -r.amount, notes: r.reason || "" });
  }
  lines.sort((a, b) => a.date.localeCompare(b.date));
  return {
    supplierId,
    supplierName: sup.name,
    totalPurchases,
    totalPaid,
    totalReturns,
    outstanding: sup.outstandingBalance,
    lines,
  };
}
