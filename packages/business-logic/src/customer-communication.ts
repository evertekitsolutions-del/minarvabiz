/**
 * Customer communication queue.
 *
 * Messages are generated locally and persisted through the existing durable outbox.
 * No provider/API is called here, so the desktop app remains fully offline-first.
 * A future WhatsApp/SMS provider can consume aggregateType `customer_communication`.
 */
import type { Customer, ServiceOrder, UUID } from "@minarvabiz/types";
import { generateId } from "@minarvabiz/utils";
import { enqueueOutbox } from "./outbox-bridge";
import { templateForOrder, type TemplateId } from "./notification-templates";

export type CustomerCommunicationChannel = "whatsapp" | "sms";

export interface QueuedCustomerMessage {
  messageId: UUID;
  orderId: UUID;
  customerId: UUID;
  channel: CustomerCommunicationChannel;
  templateId: TemplateId;
  customerName: string;
  phone: string;
  title: string;
  body: string;
  queuedAt: string;
}

const STATUS_TEMPLATES: Partial<Record<ServiceOrder["status"], TemplateId>> = {
  received: "order_received",
  processing: "order_processing",
  ready_to_deliver: "order_ready",
};

function customerPhone(customer: Customer): string | null {
  const value = customer.whatsapp?.trim() || customer.phone?.trim() || "";
  return value || null;
}

/**
 * Queue a customer-facing message when an order reaches a communicable status.
 * Returns null when the status has no customer template or no contact number exists.
 */
export function queueOrderStatusMessage(
  order: ServiceOrder,
  customer: Customer | null | undefined
): QueuedCustomerMessage | null {
  if (!customer) return null;
  const templateId = STATUS_TEMPLATES[order.status];
  if (!templateId) return null;

  const phone = customerPhone(customer);
  if (!phone) return null;

  const rendered = templateForOrder(templateId, order, customer);
  const message: QueuedCustomerMessage = {
    messageId: generateId(),
    orderId: order.id,
    customerId: customer.id,
    channel: customer.whatsapp?.trim() ? "whatsapp" : "sms",
    templateId,
    customerName: customer.name,
    phone,
    title: rendered.title,
    body: rendered.body,
    queuedAt: new Date().toISOString(),
  };

  enqueueOutbox("customer_communication", order.id, "insert", message);
  return message;
}

export function communicationTemplateForStatus(
  status: ServiceOrder["status"]
): TemplateId | null {
  return STATUS_TEMPLATES[status] ?? null;
}
