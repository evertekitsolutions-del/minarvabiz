/** Read-only laundry vendor and in-house comparison from posted tickets. */
import type { LaundryOrder } from "@minarvabiz/types";
import { addMinorUnits, fromMinorUnits, toMinorUnits } from "@minarvabiz/utils";

export interface LaundryVendorScore {
  supplierId: string | null;
  supplierName: string;
  mode: LaundryOrder["mode"];
  orders: number;
  garments: number;
  delivered: number;
  overdueOpen: number;
  qcFailedItems: number;
  customerRevenue: number;
  supplierCost: number;
  contributionBeforeInternalCosts: number;
}

export function buildLaundryVendorScorecard(
  orders: readonly LaundryOrder[],
  asOfDay: string,
): LaundryVendorScore[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDay) || Number.isNaN(Date.parse(asOfDay))) {
    throw new Error("Comparison date must be YYYY-MM-DD");
  }
  type Acc = LaundryVendorScore & { revenueMinor: number; costMinor: number };
  const byVendor = new Map<string, Acc>();
  const seen = new Set<string>();
  for (const order of orders) {
    if (seen.has(order.id) || order.deletedAt || order.status === "cancelled") continue;
    seen.add(order.id);
    const supplierId = order.mode === "outsourced" ? order.supplierId ?? null : null;
    const key = order.mode === "in_house_ironing" ? "in-house" : "vendor:" + (supplierId || "unknown");
    let entry = byVendor.get(key);
    if (!entry) {
      entry = {
        supplierId,
        supplierName: order.mode === "in_house_ironing" ? "In-house ironing" : order.supplierName || "Unassigned supplier",
        mode: order.mode, orders: 0, garments: 0, delivered: 0, overdueOpen: 0,
        qcFailedItems: 0, customerRevenue: 0, supplierCost: 0, contributionBeforeInternalCosts: 0,
        revenueMinor: 0, costMinor: 0,
      };
      byVendor.set(key, entry);
    }
    entry.orders += 1;
    entry.garments += order.quantity;
    if (order.status === "delivered") entry.delivered += 1;
    else if (order.dueAt && order.dueAt.slice(0, 10) < asOfDay) entry.overdueOpen += 1;
    entry.qcFailedItems += order.items?.filter(item => item.qualityStatus === "failed").length ?? 0;
    entry.revenueMinor = addMinorUnits(entry.revenueMinor, toMinorUnits(order.totalCustomerCharge));
    entry.costMinor = addMinorUnits(entry.costMinor, toMinorUnits(order.totalSupplierCost));
  }
  return [...byVendor.values()].map((entry) => {
    const { revenueMinor, costMinor, ...publicScore } = entry;
    return {
      ...publicScore,
      customerRevenue: fromMinorUnits(revenueMinor),
      supplierCost: fromMinorUnits(costMinor),
      contributionBeforeInternalCosts: fromMinorUnits(revenueMinor - costMinor),
    };
  }).sort((a, b) => b.supplierCost - a.supplierCost || b.orders - a.orders || a.supplierName.localeCompare(b.supplierName));
}
