"use client";

import * as React from "react";
import type { QueuedCustomerMessage, CustomerCommunicationStatus } from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { buildWhatsAppUrl } from "@minarvabiz/business-logic";

export interface CustomerCommunicationRow {
  eventId: string;
  status: CustomerCommunicationStatus;
  attempts: number;
  lastError: string | null;
  message: QueuedCustomerMessage;
}

export function CustomerCommunicationCenter({
  messages,
  onRetry,
  onRefresh,
}: {
  messages: CustomerCommunicationRow[];
  onRetry?: (eventId: string) => void;
  onRefresh?: () => void;
}) {
  const [filter, setFilter] = React.useState<"all" | CustomerCommunicationStatus>("all");
  const filtered = filter === "all" ? messages : messages.filter((row) => row.status === filter);
  const pending = messages.filter((row) => row.status === "pending").length;
  const failed = messages.filter((row) => row.status === "failed").length;
  const synced = messages.filter((row) => row.status === "synced").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Customer Communication</h2>
          <p className="text-sm text-slate-500">Track customer updates and send WhatsApp messages manually.</p>
        </div>
        <Button variant="outline" onClick={onRefresh}>Refresh</Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["Pending", pending],
          ["Failed", failed],
          ["Synced", synced],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "pending", "failed", "synced"] as const).map((value) => (
          <Button key={value} variant={filter === value ? "primary" : "outline"} onClick={() => setFilter(value)}>
            {value === "all" ? "All" : value[0].toUpperCase() + value.slice(1)}
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white py-12 text-center text-slate-400">
            No customer messages in this view.
          </div>
        )}
        {filtered.map((row) => {
          const { message } = row;
          const waUrl = message.channel === "whatsapp" ? buildWhatsAppUrl(message.phone, message.body) : null;
          return (
            <div key={row.eventId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{message.customerName}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">{message.channel}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">{row.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">Order {message.orderId} · {message.title}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {waUrl && <a className="inline-flex items-center rounded-lg border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50" href={waUrl} target="_blank" rel="noreferrer">Open WhatsApp</a>}
                  {row.status === "failed" && <Button variant="outline" onClick={() => onRetry?.(row.eventId)}>Retry</Button>}
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{message.body}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                <span>{new Date(message.queuedAt).toLocaleString("en-IN")}</span>
                {row.attempts > 0 && <span>Attempts: {row.attempts}</span>}
                {row.lastError && <span className="text-red-500">{row.lastError}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
