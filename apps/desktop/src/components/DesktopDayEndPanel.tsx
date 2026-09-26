import * as React from "react";
import { DayEndClosePanel } from "@minarvabiz/ui";
import {
  can,
  closeBusinessDay,
  listDayEndCloses,
  reopenBusinessDay,
  type DayEndCloseRecord,
} from "@minarvabiz/business-logic";

function toView(entry: DayEndCloseRecord) {
  return {
    id: entry.id,
    businessDate: entry.businessDate,
    closedAt: entry.closedAt,
    closedByRole: entry.closedByRole,
    reopenedAt: entry.reopenedAt,
    reopenedByRole: entry.reopenedByRole,
    reopenReason: entry.reopenReason,
    report: {
      totalSales: entry.report.totalSales,
      netProfit: entry.report.netProfit,
      cashReceived: entry.report.cashReceived,
      outstandingAmount: entry.report.outstandingAmount,
    },
    metricsNote: entry.metricsNote,
  };
}

export function DesktopDayEndPanel({ onChanged }: { onChanged?: () => void }) {
  const [closes, setCloses] = React.useState(() => listDayEndCloses());

  const refresh = () => {
    setCloses(listDayEndCloses());
    onChanged?.();
  };

  return (
    <DayEndClosePanel
      canClose={can("dayend.close")}
      canReopen={can("dayend.reopen")}
      closes={closes.map(toView)}
      onCloseDay={() => {
        const result = closeBusinessDay();
        if (result.error || !result.record) return { ok: false, error: result.error || "Failed" };
        refresh();
        return { ok: true, record: toView(result.record) };
      }}
      onReopenDay={(businessDate, reason) => {
        const result = reopenBusinessDay(businessDate, reason);
        if (result.error || !result.record) return { ok: false, error: result.error || "Failed" };
        refresh();
        return { ok: true, record: toView(result.record) };
      }}
    />
  );
}
