"use client";
import * as React from "react";
import type { Customer, LaundryOrder } from "@minarvabiz/types";
import {
  availableLaundryMessages, laundryCustomerMessage, manualLaundryWhatsAppUrl,
  type TemplateId,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { Modal } from "../forms/Modal";
import { selectClass } from "../forms/FormField";

export function LaundryWhatsAppPanel({
  order, customer, onClose,
}: {
  order: LaundryOrder | null;
  customer: Pick<Customer, "name" | "phone" | "whatsapp"> | null;
  onClose: () => void;
}) {
  const [selected, setSelected] = React.useState<TemplateId>("order_received");
  const [error, setError] = React.useState("");
  const options = order ? availableLaundryMessages(order) : [];
  const template = options.some(row => row.id === selected) ? selected : options[0]?.id;
  let preview = "";
  if (order && template) preview = laundryCustomerMessage(template, order, customer).body;
  function launch() {
    if (!order || !customer || !template) return;
    try {
      const url = manualLaundryWhatsAppUrl(template, order, customer);
      window.open(url, "_blank", "noopener,noreferrer");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create WhatsApp message");
    }
  }

  return <Modal open={Boolean(order)} title={order ? `WhatsApp · ${order.orderNumber}` : "Laundry WhatsApp"} onClose={onClose} className="max-w-xl">
    {order && <div className="space-y-3">
      <p className="text-xs text-slate-600">Manual click-to-share only. This does not send automatically or charge for an API.</p>
      <p className="text-sm text-slate-700">Customer: {customer?.name || order.customerName || "Unknown"} · WhatsApp: {customer?.whatsapp || customer?.phone || "No number recorded"}</p>
      {options.length === 0 ? <p className="text-sm text-amber-700">No message is appropriate for this ticket's current status.</p> : <>
        <label className="block text-sm font-medium text-slate-700">Message
          <select className={selectClass+" mt-1"} value={template} onChange={event => {setSelected(event.target.value as TemplateId);setError("");}}>
            {options.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <textarea className="w-full rounded-lg border border-slate-200 p-3 text-sm" readOnly rows={5} value={preview} aria-label="Message preview" />
        <Button type="button" disabled={!customer || !(customer.whatsapp || customer.phone)} onClick={launch}>Open WhatsApp with preview</Button>
      </>}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <p className="text-xs text-slate-500">Check customer consent and the message before choosing Send in WhatsApp.</p>
    </div>}
  </Modal>;
}
