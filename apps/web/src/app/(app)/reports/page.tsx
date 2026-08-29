"use client";

import * as React from "react";
import { ReportsPanel } from "@minarvabiz/ui";
import { phase7Store, toCsv } from "@minarvabiz/business-logic";

export default function ReportsPage() {
  const [tick, setTick] = React.useState(0);
  const salesRows = React.useMemo(() => phase7Store.salesReport(), [tick]);
  const dayEnd = React.useMemo(() => phase7Store.dayEndReport(), [tick]);
  const stock = React.useMemo(() => phase7Store.stockReport(), [tick]);
  const outstanding = React.useMemo(() => phase7Store.outstandingPaymentsReport(), [tick]);

  function exportCsv(kind: string) {
    let csv = "";
    if (kind === "sales") {
      csv = toCsv(
        ["Period", "Products", "Services", "Laundry", "Revenue", "Expenses", "Net"],
        salesRows.map((r) => [
          r.label, String(r.productSales), String(r.serviceRevenue), String(r.laundryRevenue),
          String(r.totalRevenue), String(r.expenses), String(r.netProfit),
        ])
      );
    } else if (kind === "stock") {
      csv = toCsv(
        ["Name", "SKU", "Stock", "Min", "Value", "Low"],
        stock.map((r) => [r.name, r.sku || "", String(r.stock), String(r.min), String(r.value), r.low ? "yes" : "no"])
      );
    } else if (kind === "outstanding") {
      csv = toCsv(
        ["Name", "Phone", "Outstanding"],
        outstanding.map((c) => [c.name, c.phone || "", String(c.outstanding)])
      );
    } else {
      csv = toCsv(
        ["Metric", "Value"],
        Object.entries(dayEnd).map(([k, v]) => [k, String(v)])
      );
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `minarvabiz-${kind}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <ReportsPanel
      salesRows={salesRows}
      dayEnd={dayEnd}
      stock={stock}
      outstanding={outstanding}
      onRefresh={() => setTick((t) => t + 1)}
      onExportCsv={exportCsv}
    />
  );
}
