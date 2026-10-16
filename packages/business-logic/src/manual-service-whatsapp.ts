import type { ServiceOrder } from "@minarvabiz/types";
import type { TemplateId } from "./notification-templates";

export const SERVICE_WHATSAPP_TEMPLATES: ReadonlyArray<{ id: TemplateId; label: string }> = [
  { id: "order_received", label: "Order received" },
  { id: "order_processing", label: "Processing update" },
  { id: "trial_ready", label: "Trial ready" },
  { id: "order_ready", label: "Ready for pickup" },
  { id: "delivery_reminder", label: "Delivery reminder" },
  { id: "payment_due", label: "Payment reminder" },
  { id: "feedback_request", label: "Feedback and Google review" },
];

/** Hide communications that would contradict the order's present lifecycle. */
export function availableServiceWhatsAppTemplates(
  order: Pick<ServiceOrder, "status" | "deliveryDate" | "balance">,
) {
  const active = order.status !== "cancelled" && order.status !== "delivered";
  return SERVICE_WHATSAPP_TEMPLATES.filter(({ id }) => {
    if (id === "order_received") return active;
    if (id === "order_processing") return active && order.status !== "ready_to_deliver";
    if (id === "trial_ready") return active && order.status === "qc";
    if (id === "order_ready") return order.status === "ready_to_deliver";
    if (id === "delivery_reminder") return active && Boolean(order.deliveryDate);
    if (id === "feedback_request") return order.status === "delivered";
    if (id === "payment_due") {
      return order.status !== "cancelled" &&
        Number.isFinite(order.balance) && order.balance > 0 &&
        Number.isSafeInteger(Math.round(order.balance * 100));
    }
    return false;
  });
}

/** Explicit click-to-share link only. Never sends a message or calls a paid API. */
export function buildManualServiceWhatsAppLink(phone: string, message: string): string {
  const raw = phone.trim();
  let digits: string;
  if (/^\+[1-9][\d ()-]+$/.test(raw)) {
    digits = raw.slice(1).replace(/[\s()-]/g, "");
  } else if (/^00[1-9]\d{7,14}$/.test(raw)) {
    digits = raw.slice(2);
  } else if (/^[1-9]\d{9}$/.test(raw)) {
    // Preserve the application's existing domestic India fallback for ten digits.
    digits = "91" + raw;
  } else if (/^[1-9]\d{10,14}$/.test(raw)) {
    digits = raw;
  } else {
    throw new Error("Add a valid WhatsApp number including country code to the customer.");
  }
  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    throw new Error("WhatsApp number must include a valid country code.");
  }
  if (!message.trim()) throw new Error("WhatsApp message cannot be empty.");
  return "https://wa.me/" + digits + "?text=" + encodeURIComponent(message);
}
