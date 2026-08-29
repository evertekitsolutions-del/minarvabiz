"use client";

import * as React from "react";
import { Button } from "../Button";
import { Card, CardContent } from "../Card";
import { formatMoney } from "../customers/format";

export interface DayEndCloseView {
  id: string;
  businessDate: string;
  closedAt: string;
  report: {
    totalSales: number;
    netProfit: number;
    cashReceived: number;
    outstandingAmount: number;
  };
  metricsNote: string;
}

export function DayEndClosePanel({
  closes,
  onCloseDay,
}: {
  closes: DayEndCloseView[];
  onCloseDay: () => { ok: boolean; error?: string; record?: DayEndCloseView };
}) {
  const [msg, setMsg] = React.useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Day-end close</h3>
          <p className="text-sm text-slate-500">Freeze today&apos;s totals for audit</p>
        </div>
        <Button
          onClick={() => {
            const r = onCloseDay();
            setMsg(r.ok ? `Closed ${r.record?.businessDate}` : r.error || "Failed");
          }}
        >
          Close today
        </Button>
      </div>
      {msg && <p className="text-sm text-slate-600">{msg}</p>}
      <div className="space-y-2">
        {closes.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
            No day-end closes yet
          </p>
        )}
        {closes.map((c) => (
          <Card key={c.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div>
                <div className="font-semibold text-slate-900">{c.businessDate}</div>
                <div className="text-xs text-slate-500">
                  Closed {new Date(c.closedAt).toLocaleString("en-IN")}
                </div>
                <div className="mt-1 text-xs text-slate-500">{c.metricsNote}</div>
              </div>
              <div className="text-right">
                <div>Sales {formatMoney(c.report.totalSales)}</div>
                <div className="font-medium text-emerald-700">
                  Net {formatMoney(c.report.netProfit)}
                </div>
                <div className="text-xs text-slate-500">
                  Cash {formatMoney(c.report.cashReceived)} · Due{" "}
                  {formatMoney(c.report.outstandingAmount)}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
