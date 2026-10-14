"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { NotificationCenter } from "@minarvabiz/ui";
import { phase6Store } from "@minarvabiz/business-logic";
import type { AppNotification } from "@minarvabiz/types";

export default function NotificationsPage() {
  const router = useRouter();
  const [list, setList] = React.useState<AppNotification[]>([]);

  const refresh = React.useCallback(() => {
    setList(phase6Store.listNotifications());
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  const unreadCount = list.filter((notification) => !notification.isRead).length;

  return (
    <section className="space-y-4" aria-labelledby="notifications-heading">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="notifications-heading" className="text-2xl font-semibold text-slate-900">Notifications</h1>
          <p className="mt-1 text-sm text-slate-600" role="status" aria-live="polite">
            {unreadCount === 0 ? "No unread notifications" : `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
          </p>
        </div>
        <button type="button" onClick={refresh} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600">
          Refresh notifications
        </button>
      </header>
      <NotificationCenter
        notifications={list}
        onMarkRead={(id) => { phase6Store.markNotificationRead(id); refresh(); }}
        onMarkAllRead={() => { phase6Store.markAllNotificationsRead(); refresh(); }}
        onNavigate={(href) => router.push(href)}
      />
    </section>
  );
}
