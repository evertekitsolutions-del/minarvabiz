"use client";

import * as React from "react";
import { ReportsPanel, DayEndClosePanel } from "@minarvabiz/ui";
import {
  phase7Store,
  toCsv,
  closeBusinessDay,
  listDayEndCloses,
} from "@minarvabiz/business-logic";

export default function ReportsPage() {
  const [tick, setTick] = React.useState(0);
  const [closes, setCloses] = React.useState(() => listDayEndCloses());
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
          r.label,
          String(r.productSales),
          String(r.serviceRevenue),
          String(r.laundryRevenue),
          String(r.totalRevenue),
          String(r.expenses),
          String(r.netProfit),
        ])
      );
    } else if (kind === "stock") {
      csv = toCsv(
        ["Name", "SKU", "Stock", "Min", "Value", "Low"],
        stock.map((r) => [
          r.name,
          r.sku || "",
          String(r.stock),
          String(r.min),
          String(r.value),
          r.low ? "yes" : "no",
        ])
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
    <div className="space-y-8">
      <ReportsPanel
        salesRows={salesRows}
        dayEnd={dayEnd}
        stock={stock}
        outstanding={outstanding}
        onRefresh={() => setTick((t) => t + 1)}
        onExportCsv={exportCsv}
      />
      <DayEndClosePanel
        closes={closes.map((c) => ({
          id: c.id,
          businessDate: c.businessDate,
          closedAt: c.closedAt,
          report: {
            totalSales: c.report.totalSales,
            netProfit: c.report.netProfit,
            cashReceived: c.report.cashReceived,
            outstandingAmount: c.report.outstandingAmount,
          },
          metricsNote: c.metricsNote,
        }))}
        onCloseDay={() => {
          const result = closeBusinessDay();
          if (result.error || !result.record) {
            return { ok: false, error: result.error || "Failed" };
          }
          setCloses(listDayEndCloses());
          setTick((t) => t + 1);
          return {
            ok: true,
            record: {
              id: result.record.id,
              businessDate: result.record.businessDate,
              closedAt: result.record.closedAt,
              report: {
                totalSales: result.record.report.totalSales,
                netProfit: result.record.report.netProfit,
                cashReceived: result.record.report.cashReceived,
                outstandingAmount: result.record.report.outstandingAmount,
              },
              metricsNote: result.record.metricsNote,
            },
          };
        }}
      />
    </div>
  );
}
