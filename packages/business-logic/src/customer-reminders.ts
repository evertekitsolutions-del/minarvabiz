/**
 * Offline-first automatic customer reminder planner.
 * Safe to run repeatedly: communication queue deduplicates by order + template.
 */
import type { ISODateString } from "@minarvabiz/types";
import * as store from "./store";
import * as ordersStore from "./orders-store";
import { queueDeliveryReminder, queuePaymentReminder } from "./customer-communication";

function dayStart(value: string | Date): number {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export interface ReminderRunResult {
  scannedOrders: number;
  deliveryRemindersQueued: number;
  paymentRemindersQueued: number;
}

/**
 * Queue due-soon delivery and payment reminders for eligible orders.
 * Delivery reminders are planned for orders due today or tomorrow.
 */
export function runAutomatedCustomerReminders(now: ISODateString | Date = new Date()): ReminderRunResult {
  const today = dayStart(now);
  const tomorrow = today + 24 * 60 * 60 * 1000;
  let deliveryRemindersQueued = 0;
  let paymentRemindersQueued = 0;

  const orders = ordersStore.listOrders();
  for (const order of orders) {
    const customer = store.getCustomer(order.customerId);
    if (!customer) continue;

    if (order.deliveryDate) {
      const due = dayStart(order.deliveryDate);
      if (due === today || due === tomorrow || due < today) {
        if (queueDeliveryReminder(order, customer)) deliveryRemindersQueued += 1;
      }
    }

    if (order.balance > 0) {
      if (queuePaymentReminder(order, customer)) paymentRemindersQueued += 1;
    }
  }

  return {
    scannedOrders: orders.length,
    deliveryRemindersQueued,
    paymentRemindersQueued,
  };
}
