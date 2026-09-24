import type { UUID } from "@minarvabiz/types";
import { addMinorUnits, fromMinorUnits, toMinorUnits } from "@minarvabiz/utils";
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
  let totalPurchasesMinor = 0;
  let totalPaidMinor = 0;
  const lines: SupplierStatement["lines"] = [];
  for (const p of purchases) {
    totalPurchasesMinor = addMinorUnits(totalPurchasesMinor, toMinorUnits(p.amount));
    totalPaidMinor = addMinorUnits(totalPaidMinor, toMinorUnits(p.paidAmount));
    lines.push({ date: p.date, type: "purchase", amount: p.amount, notes: p.purchaseNumber || p.id });
  }
  let totalReturnsMinor = 0;
  for (const r of returns) {
    totalReturnsMinor = addMinorUnits(totalReturnsMinor, toMinorUnits(r.amount));
    lines.push({ date: r.createdAt.slice(0, 10), type: "return", amount: -r.amount, notes: r.reason || "" });
  }
  for (const payment of phase5.listSupplierPayments(supplierId)) {
    totalPaidMinor = addMinorUnits(totalPaidMinor, toMinorUnits(payment.amount));
    lines.push({
      date: payment.paidAt.slice(0, 10),
      type: "payment",
      amount: -payment.amount,
      notes: payment.notes || payment.method,
    });
  }
  lines.sort((a, b) => a.date.localeCompare(b.date));
  return {
    supplierId,
    supplierName: sup.name,
    totalPurchases: fromMinorUnits(totalPurchasesMinor),
    totalPaid: fromMinorUnits(totalPaidMinor),
    totalReturns: fromMinorUnits(totalReturnsMinor),
    outstanding: sup.outstandingBalance,
    lines,
  };
}
