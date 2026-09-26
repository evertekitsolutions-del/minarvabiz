"use client";

import * as React from "react";
import { CustomerCommunicationCenter, type CustomerCommunicationRow } from "./CustomerCommunicationCenter";

type CommunicationBridge = {
  list: () => CustomerCommunicationRow[];
  retry: (eventId: string) => boolean;
};

declare global {
  interface Window {
    minarvaCustomerCommunication?: CommunicationBridge;
  }
}

export function CustomerMessagesPanel() {
  const [messages, setMessages] = React.useState<CustomerCommunicationRow[]>([]);

  const refresh = React.useCallback(() => {
    setMessages(window.minarvaCustomerCommunication?.list?.() ?? []);
  }, []);

  React.useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 1500);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Customer Messages</h2>
        <p className="text-sm text-slate-500">
          WhatsApp/SMS communication queue for order updates, delivery reminders and payment reminders.
        </p>
      </div>
      <CustomerCommunicationCenter
        messages={messages}
        onRetry={(eventId) => {
          if (window.minarvaCustomerCommunication?.retry?.(eventId)) refresh();
        }}
        onRefresh={refresh}
      />
    </div>
  );
}
