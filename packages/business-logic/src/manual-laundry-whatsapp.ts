/** Manual click-to-send laundry WhatsApp only; no provider/API calls. */
import type { LaundryOrder } from "@minarvabiz/types";
import { buildManualServiceWhatsAppLink } from "./manual-service-whatsapp";

export type LaundryWhatsAppTemplateId =
  | "ticket_received" | "processing" | "ready" | "due_reminder" | "payment_due" | "feedback";

export interface LaundryWhatsAppMessage {
  id: LaundryWhatsAppTemplateId;
  label: string;
  message: string;
}

export function availableLaundryWhatsAppMessages(
  order: Pick<LaundryOrder, "orderNumber" | "status" | "dueAt" | "balanceAmount" | "customerName" | "items">,
  businessName = "Our laundry",
  reviewUrl?: string | null,
): LaundryWhatsAppMessage[] {
  if (order.status === "cancelled") return [];
  const customer = order.customerName?.trim() || "Customer";
  const name = businessName.trim() || "Our laundry";
  const prefix = "Hello " + customer + ", " + name + " update for laundry ticket " + order.orderNumber + ": ";
  const result: LaundryWhatsAppMessage[] = [];
  if (order.status === "pending" || order.status === "sent" || order.status === "received") {
    result.push({ id:"ticket_received",label:"Ticket confirmation",
      message:prefix+"your garments are registered. Please keep your ticket number for reference." });
  }
  if (order.status === "sent" || order.status === "received") {
    result.push({ id:"processing",label:"Processing update",
      message:prefix+"your garments are being processed. We will update you when they are ready." });
  }
  const itemReady = !!order.items?.length && order.items.every(
    item => item.qualityStatus === "passed"
      && (item.processingStatus === "ready" || item.processingStatus === "delivered")
  );
  if (itemReady || order.status === "delivered") {
    result.push({ id:"ready",label:"Ready / completed",
      message:prefix+"your garments are ready for collection or have been handed over. Thank you." });
  }
  if (order.dueAt && order.status !== "delivered") {
    result.push({ id:"due_reminder",label:"Due-date reminder",
      message:prefix+"your current expected delivery date is "+order.dueAt.slice(0,10)+". Please contact us if you need assistance." });
  }
  if (Number.isFinite(order.balanceAmount) && order.balanceAmount > 0) {
    const amount = new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(order.balanceAmount);
    result.push({ id:"payment_due",label:"Payment reminder",
      message:prefix+"an outstanding balance of "+amount+" is recorded on your ticket. Please contact us to settle it." });
  }
  if (order.status === "delivered") {
    result.push({ id:"feedback",label:"Feedback / review",
      message:prefix+"thank you for using our service. We would appreciate your feedback."+
      (reviewUrl && /^https:\/\//i.test(reviewUrl) ? " Review link: "+reviewUrl : "") });
  }
  return result;
}

export function laundryManualWhatsAppLink(phone: string, message: LaundryWhatsAppMessage): string {
  return buildManualServiceWhatsAppLink(phone, message.message);
}
