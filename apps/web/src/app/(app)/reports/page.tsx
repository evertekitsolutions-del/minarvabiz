"use client";

import * as React from "react";
import { ReportsPanel, DayEndClosePanel } from "@minarvabiz/ui";
import {
  phase7Store,
  accountingStore,
  procurementStore,
  closeBusinessDay,
  listDayEndCloses,
} from "@minarvabiz/business-logic";

export default function ReportsPage() {
  const [tick, setTick] = React.useState(0);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [closes, setCloses] = React.useState(() => listDayEndCloses());
  const salesRows = React.useMemo(() => phase7Store.salesReport(from || undefined, to ? `${to}T23:59:59.999Z` : undefined), [tick, from, to]);
  const dayEnd = React.useMemo(() => phase7Store.dayEndReport(), [tick]);
  const stock = React.useMemo(() => phase7Store.stockReport(), [tick]);
  const outstanding = React.useMemo(() => phase7Store.outstandingPaymentsReport(), [tick]);

  const payables = React.useMemo(() => procurementStore.buildSupplierPayableAging(to || undefined), [tick, to]);
  const financial = React.useMemo(() => ({
    trialBalance: accountingStore.buildTrialBalance(to || undefined),
    profit: accountingStore.buildProfitAndLoss(from || undefined, to || undefined),
    balance: accountingStore.buildBalanceSheet(to || undefined),
  }), [tick, from, to]);
  const taxReport = React.useMemo(() => accountingStore.buildTaxReconciliation(from || undefined, to || undefined), [tick, from, to]);

  return (
    <div className="space-y-8">
      <ReportsPanel
        salesRows={salesRows}
        dayEnd={dayEnd}
        stock={stock}
        outstanding={outstanding}
        payables={payables}
        financial={financial}
        taxReport={taxReport}
        onRefresh={() => setTick((t) => t + 1)}
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
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
