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

  return (
    <NotificationCenter
      notifications={list}
      onMarkRead={(id) => { phase6Store.markNotificationRead(id); refresh(); }}
      onMarkAllRead={() => { phase6Store.markAllNotificationsRead(); refresh(); }}
      onNavigate={(href) => router.push(href)}
    />
  );
}
