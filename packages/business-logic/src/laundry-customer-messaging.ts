/** Laundry communications reuse existing service templates and validated manual WhatsApp launcher. */
import type { Customer, LaundryOrder } from "@minarvabiz/types";
import { formatMoney } from "@minarvabiz/utils";
import { buildManualServiceWhatsAppLink } from "./manual-service-whatsapp";
import { renderTemplate, type TemplateId } from "./notification-templates";

export const LAUNDRY_MESSAGE_OPTIONS: ReadonlyArray<{ id: TemplateId; label: string }> = [
  { id: "order_received", label: "Booking confirmation" },
  { id: "order_processing", label: "Processing update" },
  { id: "order_ready", label: "Ready for collection" },
  { id: "delivery_reminder", label: "Due-date reminder" },
  { id: "payment_due", label: "Balance reminder" },
  { id: "feedback_request", label: "Customer feedback" },
];

export function availableLaundryMessages(order: LaundryOrder) {
  const active = order.status !== "cancelled" && order.status !== "delivered";
  const ready = (order.mode === "in_house_ironing" || order.status === "received")
    && !!order.items?.length
    && order.items.every(item => (item.processingStatus === "ready" || item.processingStatus === "delivered")
      && item.qualityStatus === "passed");
  return LAUNDRY_MESSAGE_OPTIONS.filter(({ id }) => {
    if (id === "order_received") return active;
    if (id === "order_processing") return active && !ready;
    if (id === "order_ready") return active && ready;
    if (id === "delivery_reminder") return active && !!order.dueAt;
    if (id === "payment_due") return order.status !== "cancelled"
      && Number.isFinite(order.balanceAmount) && order.balanceAmount > 0;
    if (id === "feedback_request") return order.status === "delivered";
    return false;
  });
}

export function laundryCustomerMessage(
  templateId: TemplateId,
  order: LaundryOrder,
  customer?: Pick<Customer, "name"> | null,
) {
  if (!availableLaundryMessages(order).some(option => option.id === templateId)) {
    throw new Error("This message is unavailable for the current laundry stage");
  }
  return renderTemplate(templateId, {
    customerName: customer?.name || order.customerName || "Customer",
    orderNumber: order.orderNumber,
    serviceType: order.mode === "outsourced" ? "laundry" : "ironing",
    deliveryDate: order.dueAt || "TBD",
    balance: formatMoney(order.balanceAmount),
    amount: formatMoney(order.balanceAmount),
  });
}

/** Manual user-click only. This function never sends to or contacts WhatsApp. */
export function manualLaundryWhatsAppUrl(
  templateId: TemplateId,
  order: LaundryOrder,
  customer: Pick<Customer, "name" | "phone" | "whatsapp">,
): string {
  const phone = customer.whatsapp?.trim() || customer.phone?.trim() || "";
  return buildManualServiceWhatsAppLink(phone, laundryCustomerMessage(templateId, order, customer).body);
}
