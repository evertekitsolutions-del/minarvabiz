/**
 * Customer communication queue.
 *
 * Messages are generated locally and persisted through the existing durable outbox.
 * No provider/API is called here, so the desktop app remains fully offline-first.
 */
import type { Customer, ServiceOrder, UUID } from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { enqueueOutbox, exportOutbox, markOutboxFailed } from "./outbox-bridge";
import { touchPersistence } from "./autosave";
import { templateForOrder, type TemplateId } from "./notification-templates";

export type CustomerCommunicationChannel = "whatsapp" | "sms";
export type CustomerCommunicationStatus = "pending" | "failed" | "synced";

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

function communicationEvents() {
  return exportOutbox().filter((event) => event.aggregateType === "customer_communication");
}

/** Queue a customer-facing message when an order reaches a communicable status. */
export function queueOrderStatusMessage(
  order: ServiceOrder,
  customer: Customer | null | undefined
): QueuedCustomerMessage | null {
  if (!customer) return null;
  const templateId = STATUS_TEMPLATES[order.status];
  if (!templateId) return null;

  const phone = customerPhone(customer);
  if (!phone) return null;

  const duplicate = communicationEvents().some((event) => {
    if (event.status === "failed") return false;
    const payload = event.payload as Partial<QueuedCustomerMessage> | null;
    return payload?.orderId === order.id && payload?.templateId === templateId;
  });
  if (duplicate) return null;

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
    queuedAt: nowISO(),
  };

  enqueueOutbox("customer_communication", order.id, "insert", message);
  return message;
}

export function listCustomerCommunicationQueue(): Array<{
  eventId: UUID;
  status: CustomerCommunicationStatus;
  attempts: number;
  lastError: string | null;
  message: QueuedCustomerMessage;
}> {
  return communicationEvents()
    .map((event) => ({
      eventId: event.id,
      status: event.status,
      attempts: event.attempts,
      lastError: event.lastError,
      message: event.payload as QueuedCustomerMessage,
    }))
    .sort((a, b) => b.message.queuedAt.localeCompare(a.message.queuedAt));
}

export function recordCustomerCommunicationFailure(eventId: UUID, error: string): boolean {
  const event = communicationEvents().find((item) => item.id === eventId);
  if (!event) return false;
  markOutboxFailed(eventId, error);
  touchPersistence();
  return true;
}

export function retryCustomerCommunication(eventId: UUID): boolean {
  const event = communicationEvents().find((item) => item.id === eventId);
  if (!event || event.status !== "failed") return false;
  event.status = "pending";
  event.lastError = null;
  touchPersistence();
  return true;
}

export function communicationTemplateForStatus(
  status: ServiceOrder["status"]
): TemplateId | null {
  return STATUS_TEMPLATES[status] ?? null;
}
