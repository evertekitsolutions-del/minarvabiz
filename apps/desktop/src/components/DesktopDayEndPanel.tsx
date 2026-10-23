import * as React from "react";
import { DayEndClosePanel } from "@minarvabiz/ui";
import { persistDomainToSqlite } from "../lib/sqlite-bootstrap";
import { createDurableDayEndController } from "../lib/durable-day-end";
import {
  can,
  closeBusinessDay,
  listDayEndCloses,
  reopenBusinessDay,
  type DayEndCloseRecord,
} from "@minarvabiz/business-logic";

// Module-level lifetime survives navigating away from a failed disk write.
const durableDayEnd = createDurableDayEndController<DayEndCloseRecord>(
  closeBusinessDay, reopenBusinessDay, persistDomainToSqlite,
);

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
  const [pending, setPending] = React.useState(() => durableDayEnd.hasPending());

  const refresh = () => {
    setCloses(listDayEndCloses());
    setPending(durableDayEnd.hasPending());
    onChanged?.();
  };

  return (
    <DayEndClosePanel
      canClose={can("dayend.close")}
      canReopen={can("dayend.reopen")}
      closes={closes.map(toView)}
      hasUnsaved={pending}
      onCloseDay={async () => {
        try {
          const result = await durableDayEnd.close();
          return { ok: result.ok, error: result.error, record: result.record ? toView(result.record) : undefined };
        } finally { refresh(); }
      }}
      onReopenDay={async (businessDate, reason) => {
        try {
          const result = await durableDayEnd.reopen(businessDate, reason);
          return { ok: result.ok, error: result.error, record: result.record ? toView(result.record) : undefined };
        } finally { refresh(); }
      }}
      onRetryPending={async () => {
        try {
          const result = await durableDayEnd.retry();
          return { ok: result.ok, error: result.error, record: result.record ? toView(result.record) : undefined };
        } finally { refresh(); }
      }}
    />
  );
}
