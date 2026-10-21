"use client";

import * as React from "react";
import type { Sale } from "@minarvabiz/types";
import type {
  RecurringInvoiceCartPreview,
  RecurringInvoiceFrequency,
  RecurringInvoiceOccurrence,
  RecurringInvoiceSchedule,
  RecurringInvoiceStatus,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { FormField, inputClass, selectClass } from "../forms/FormField";

export interface RecurringInvoiceWorkspaceAdapter {
  /** Reload from authorised host storage; no renderer-owned tenant identity. */
  refresh: () => Promise<{
    schedules: readonly RecurringInvoiceSchedule[];
    pending: readonly RecurringInvoiceOccurrence[];
  }>;
  create: (draft: {
    sourceSaleId: string;
    firstDueDate: string;
    frequency: RecurringInvoiceFrequency;
    interval: number;
  }) => Promise<void>;
  setStatus: (
    scheduleId: string, expectedVersion: number, status: RecurringInvoiceStatus,
  ) => Promise<void>;
  stageDue: (scheduleId: string, asOfDate: string) => Promise<void>;
  preview: (pendingDraftId: string, asOfDate: string) => Promise<RecurringInvoiceCartPreview>;
  /** Host must use a trusted authenticated approver + transactional invoice writer. */
  approveAndPost?: (pendingDraftId: string, asOfDate: string) => Promise<{ invoiceId: string }>;
}

export interface RecurringInvoiceWorkspaceProps {
  /** Must be enabled by an authorised host with a production adapter, NOT a UI toggle. */
  enabled: boolean;
  businessDate: string;
  sourceSales: readonly Sale[];
  adapter: RecurringInvoiceWorkspaceAdapter;
}
type Notice = { kind: "error" | "success"; message: string };
const eligible = (sale: Sale): boolean =>
  (sale.status === "completed" || sale.status === "partial") &&
  Boolean(sale.customerId) && !sale.deletedAt &&
  sale.items.length > 0 && sale.items.every((i) => !i.dimensionMetadata);

export function RecurringInvoiceWorkspace({
  enabled, businessDate, sourceSales, adapter,
}: RecurringInvoiceWorkspaceProps) {
  const [schedules, setSchedules] = React.useState<readonly RecurringInvoiceSchedule[]>([]);
  const [pending, setPending] = React.useState<readonly RecurringInvoiceOccurrence[]>([]);
  const [sourceSaleId, setSourceSaleId] = React.useState("");
  const [firstDueDate, setFirstDueDate] = React.useState(businessDate);
  const [frequency, setFrequency] = React.useState<RecurringInvoiceFrequency>("monthly");
  const [interval, setInterval] = React.useState(1);
  const [selectedPreview, setSelectedPreview] = React.useState<RecurringInvoiceCartPreview | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice | null>(null);

  const reload = React.useCallback(async () => {
    const data = await adapter.refresh();
    setSchedules(data.schedules);
    setPending(data.pending);
  }, [adapter]);

  React.useEffect(() => {
    if (!enabled) return;
    let active = true;
    void adapter.refresh().then((data) => {
      if (active) {
        setSchedules(data.schedules);
        setPending(data.pending);
      }
    }).catch((error: unknown) => {
      if (active) setNotice({
        kind: "error", message: error instanceof Error ? error.message : "Cannot load recurring invoices",
      });
    });
    return () => { active = false; };
  }, [adapter, enabled]);

  const run = React.useCallback(async (action: () => Promise<void>, label: string) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await action();
      await reload();
      setNotice({ kind: "success", message: label });
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }, [busy, reload]);

  if (!enabled) return null;

  const eligibleSales = sourceSales.filter(eligible);
  const currentSchedule = selectedPreview
    ? schedules.find((schedule) => schedule.id === selectedPreview.scheduleId)
    : null;
  const currentPending = selectedPreview
    ? pending.find((draft) => draft.id === selectedPreview.occurrenceId)
    : null;
  const validPreview = Boolean(currentSchedule?.status === "active" && currentPending);
  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
      aria-label="Recurring invoices">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Recurring invoices</h3>
        <p className="text-sm text-slate-600">
          Due invoices remain drafts until a verified, authorised posting. Prices, tax and stock
          are refreshed before approval.
        </p>
      </div>
      {notice && <p role={notice.kind === "error" ? "alert" : "status"}
        className={notice.kind === "error" ? "text-sm text-red-700" : "text-sm text-green-700"}>
        {notice.message}
      </p>}
      <form className="grid gap-3 md:grid-cols-4" onSubmit={(event) => {
        event.preventDefault();
        void run(() => adapter.create({ sourceSaleId, firstDueDate, frequency, interval }),
          "Recurring invoice schedule saved");
      }}>
        <FormField label="Issued customer invoice">
          <select className={selectClass} value={sourceSaleId}
            onChange={(event) => setSourceSaleId(event.target.value)} required disabled={busy}>
            <option value="">Choose invoice</option>
            {eligibleSales.map((sale) => (
              <option key={sale.id} value={sale.id}>{sale.invoiceNumber} — {sale.customerName ?? sale.customerId}</option>
            ))}
          </select>
        </FormField>
        <FormField label="First due date">
          <input type="date" required className={inputClass} value={firstDueDate}
            onChange={(event) => setFirstDueDate(event.target.value)} disabled={busy}/>
        </FormField>
        <FormField label="Frequency">
          <select className={selectClass} value={frequency} disabled={busy}
            onChange={(event) => setFrequency(event.target.value as RecurringInvoiceFrequency)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </FormField>
        <FormField label="Repeat every">
          <input type="number" min={1} max={12} step={1} required className={inputClass}
            value={interval} disabled={busy}
            onChange={(event) => setInterval(Number(event.target.value))}/>
        </FormField>
        <div className="md:col-span-4">
          <Button type="submit" disabled={busy || !sourceSaleId}>Create schedule</Button>
        </div>
      </form>
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Schedules</h4>
        {schedules.length === 0 && <p className="text-sm text-slate-500">No recurring schedules in this branch.</p>}
        {schedules.map((schedule) => (
          <div key={schedule.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
            <span>{schedule.frequency} · {schedule.firstDueDate} · {schedule.status} · {schedule.customerId}</span>
            <div className="flex flex-wrap gap-2">
              {schedule.status === "active" && <Button size="sm" variant="outline" disabled={busy}
                onClick={() => void run(() => adapter.stageDue(schedule.id, businessDate), "Due invoice drafts updated")}>
                Stage due
              </Button>}
              {schedule.status !== "cancelled" &&
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(
                  () => adapter.setStatus(schedule.id, schedule.version,
                    schedule.status === "active" ? "paused" : "active"),
                  "Schedule status updated",
                )}>{schedule.status === "active" ? "Pause" : "Resume"}</Button>}
              {schedule.status !== "cancelled" &&
                <Button size="sm" variant="danger" disabled={busy} onClick={() => void run(
                  () => adapter.setStatus(schedule.id, schedule.version, "cancelled"),
                  "Schedule cancelled",
                )}>Cancel</Button>}
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Pending customer invoice reviews</h4>
        {pending.length === 0 && <p className="text-sm text-slate-500">No invoices awaiting review.</p>}
        {pending.map((draft) => (
          <div key={draft.id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
            <span>{draft.dueDate} · {draft.scheduleId} · #{draft.sequence}</span>
            <Button size="sm" variant="outline" disabled={busy}
              onClick={() => void run(async () => {
                const result = await adapter.preview(draft.id, businessDate);
                setSelectedPreview(result);
              }, "Live invoice preview generated")}>Review</Button>
          </div>
        ))}
      </div>
      {selectedPreview && <div className="space-y-2 rounded border border-indigo-200 bg-indigo-50 p-3"
        role="region" aria-label="Recurring invoice review">
        <h4 className="text-sm font-semibold">Live checkout review — not yet posted</h4>
        <p className="text-sm">Due: {selectedPreview.dueDate} · Customer: {selectedPreview.customerId}</p>
        <ul className="space-y-1 text-sm">
          {selectedPreview.lines.map((line, index) => (
            <li key={index}>{line.productName}: {line.quantity} × {line.unitPrice}</li>
          ))}
        </ul>
        <p className="font-semibold">Total: {selectedPreview.totals.grandTotal.toFixed(2)} {selectedPreview.currency}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setSelectedPreview(null)}>Close review</Button>
          {adapter.approveAndPost && validPreview &&
            <Button disabled={busy} onClick={() => void run(async () => {
              // Do NOT use preview values as financial authority: the trusted host
              // must independently revalidate every ledger/stock parameter.
              const result = await adapter.approveAndPost!(selectedPreview.occurrenceId, businessDate);
              if (!result.invoiceId) throw new Error("No verified posted invoice was returned");
              setSelectedPreview(null);
            }, "Verified invoice posted")}>Approve and create invoice</Button>}
        </div>
      </div>}
    </section>
  );
}
