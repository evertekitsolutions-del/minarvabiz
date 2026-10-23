"use client";

import * as React from "react";
import { Button } from "../Button";
import { Card, CardContent } from "../Card";
import { formatMoney } from "../customers/format";

export interface DayEndCloseView {
  id: string;
  businessDate: string;
  closedAt: string;
  closedByRole?: string | null;
  reopenedAt?: string | null;
  reopenedByRole?: string | null;
  reopenReason?: string | null;
  report: {
    totalSales: number;
    netProfit: number;
    cashReceived: number;
    outstandingAmount: number;
  };
  metricsNote: string;
}

type DayEndMutationResult = { ok: boolean; error?: string; record?: DayEndCloseView };

export function DayEndClosePanel({
  closes,
  onCloseDay,
  onReopenDay,
  canClose = true,
  canReopen = false,
  hasUnsaved = false,
  onRetryPending,
}: {
  closes: DayEndCloseView[];
  onCloseDay: () => DayEndMutationResult | Promise<DayEndMutationResult>;
  onReopenDay?: (businessDate: string, reason: string) => DayEndMutationResult | Promise<DayEndMutationResult>;
  hasUnsaved?: boolean;
  onRetryPending?: () => Promise<DayEndMutationResult>;
  canClose?: boolean;
  canReopen?: boolean;
}) {
  const [msg, setMsg] = React.useState<string | null>(null);
  const [reopenId, setReopenId] = React.useState<string | null>(null);
  const [reopenReason, setReopenReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);

  const run = async (action: () => DayEndMutationResult | Promise<DayEndMutationResult>,
    successText: (result: DayEndMutationResult) => string) => {
    if (busyRef.current) return { ok: false };
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await action();
      setMsg(result.ok ? successText(result) : result.error || "Day-end operation failed.");
      return result;
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Day-end operation failed.");
      return { ok: false };
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const closeToday = async () => {
    if (busyRef.current || hasUnsaved) {
      setMsg("Save the pending day-end operation before another change.");
      return;
    }
    if (!canClose) {
      setMsg("You do not have permission to close the business day.");
      return;
    }
    if (!window.confirm("Close and lock today? New financial postings will be blocked until the day is reopened.")) return;
    await run(onCloseDay, (result) => `Closed and locked ${result.record?.businessDate}`);
  };

  const reopen = async (close: DayEndCloseView) => {
    if (busyRef.current || hasUnsaved) {
      setMsg("Save the pending day-end operation before another change.");
      return;
    }
    const reason = reopenReason.trim();
    if (reason.length < 3) {
      setMsg("Reopen reason is required.");
      return;
    }
    if (!window.confirm(`Reopen business day ${close.businessDate}? This action is recorded in the audit log.`)) return;
    const result = await run(() => onReopenDay?.(close.businessDate, reason) ?? { ok: false, error: "Reopen action unavailable" },
      () => `Reopened ${close.businessDate}`);
    if (result.ok) {
      setReopenId(null);
      setReopenReason("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Day-end close & lock</h3>
          <p className="text-sm text-slate-500">
            Snapshot today&apos;s totals, lock financial posting, and preserve a reasoned reopen audit trail.
          </p>
        </div>
        <Button disabled={!canClose || busy || hasUnsaved} onClick={() => void closeToday()}>
          Close & lock today
        </Button>
      </div>
      {hasUnsaved && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        A day-end close/reopen changed the local session but its SQLite save is unconfirmed. Do not close the application or repeat the operation.
        {onRetryPending && <Button type="button" variant="outline" disabled={busy} onClick={() => void run(onRetryPending, () => "Original day-end change saved to SQLite.")}>
          {busy ? "Saving…" : "Retry saving existing day-end"}
        </Button>}
      </div>}
      {msg && <p role="status" className="text-sm text-slate-600">{msg}</p>}
      <div className="space-y-2">
        {closes.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
            No day-end closes yet
          </p>
        )}
        {closes.map((c) => {
          const reopened = Boolean(c.reopenedAt);
          return (
            <Card key={c.id}>
              <CardContent className="space-y-3 p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{c.businessDate}</span>
                      <span className={reopened
                        ? "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                        : "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"}>
                        {reopened ? "Reopened" : "Closed & locked"}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Closed {new Date(c.closedAt).toLocaleString("en-IN")}
                      {c.closedByRole ? ` · ${c.closedByRole.replaceAll("_", " ")}` : ""}
                    </div>
                    {reopened && (
                      <div className="mt-1 text-xs text-amber-700">
                        Reopened {new Date(c.reopenedAt!).toLocaleString("en-IN")}
                        {c.reopenedByRole ? ` · ${c.reopenedByRole.replaceAll("_", " ")}` : ""}
                        {c.reopenReason ? ` · Reason: ${c.reopenReason}` : ""}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-slate-500">{c.metricsNote}</div>
                  </div>
                  <div className="text-right">
                    <div>Sales {formatMoney(c.report.totalSales)}</div>
                    <div className="font-medium text-emerald-700">Net {formatMoney(c.report.netProfit)}</div>
                    <div className="text-xs text-slate-500">
                      Cash {formatMoney(c.report.cashReceived)} · Due {formatMoney(c.report.outstandingAmount)}
                    </div>
                  </div>
                </div>

                {!reopened && canReopen && onReopenDay && (
                  <div className="border-t border-slate-100 pt-3">
                    {reopenId !== c.id ? (
                      <Button variant="outline" size="sm" onClick={() => { setReopenId(c.id); setReopenReason(""); }}>
                        Reopen day
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <label className="block text-xs font-medium text-slate-600">
                          Reopen reason
                          <input
                            autoFocus
                            value={reopenReason}
                            onChange={(event) => setReopenReason(event.target.value)}
                            placeholder="Required for audit trail"
                            className="mt-1 block h-9 w-full rounded-lg border border-slate-200 px-3 text-sm"
                          />
                        </label>
                        <div className="flex gap-2">
                          <Button size="sm" disabled={busy || hasUnsaved} onClick={() => void reopen(c)}>Confirm reopen</Button>
                          <Button variant="outline" size="sm" onClick={() => { setReopenId(null); setReopenReason(""); }}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
