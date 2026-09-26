"use client";

import * as React from "react";
import type { AppNotification } from "@minarvabiz/types";
import { Button } from "../Button";
import { cn } from "../../lib/cn";

export function NotificationCenter({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onNavigate,
}: {
  notifications: AppNotification[];
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  onNavigate?: (href: string) => void;
}) {
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Alerts & Notifications</h2>
          <p className="text-sm text-slate-500">{unread} unread operational alert{unread === 1 ? "" : "s"}</p>
        </div>
        <Button variant="outline" onClick={onMarkAllRead} disabled={unread === 0}>Mark all read</Button>
      </div>
      <div className="space-y-2">
        {notifications.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 bg-white py-12 text-center text-slate-400">
            No alerts or notifications
          </p>
        )}
        {notifications.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => { onMarkRead?.(n.id); if (n.href) onNavigate?.(n.href); }}
            className={cn(
              "flex w-full flex-col rounded-xl border px-4 py-3 text-left transition hover:border-indigo-200",
              n.read ? "border-slate-100 bg-white" : "border-indigo-100 bg-indigo-50/40"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900">{n.title}</span>
              <span className="text-[10px] uppercase tracking-wide text-slate-400">{n.kind.replaceAll("_", " ")}</span>
            </div>
            <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>
            <p className="mt-1 text-xs text-slate-400">{new Date(n.createdAt).toLocaleString("en-IN")}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
