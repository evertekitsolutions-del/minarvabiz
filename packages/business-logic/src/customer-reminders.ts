/**
 * Offline-first automatic customer reminder planner.
 * Safe to run repeatedly: communication queue deduplicates by order + template.
 */
import type { ISODateString } from "@minarvabiz/types";
import * as store from "./store";
import * as ordersStore from "./orders-store";
import { queueDeliveryReminder, queuePaymentReminder } from "./customer-communication";

function calendarDay(value: string | Date): string {
  // Delivery dates are business calendar dates, not instants in time. When a
  // full timestamp is supplied we use the machine's local calendar day so a
  // late-night UTC boundary cannot shift a reminder by one day.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(day: string, amount: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const value = new Date(year, month - 1, date);
  value.setDate(value.getDate() + amount);
  return calendarDay(value);
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
  const today = calendarDay(now);
  if (!today) return { scannedOrders: 0, deliveryRemindersQueued: 0, paymentRemindersQueued: 0 };
  const tomorrow = addDays(today, 1);
  let deliveryRemindersQueued = 0;
  let paymentRemindersQueued = 0;

  const orders = ordersStore.listOrders();
  for (const order of orders) {
    const customer = store.getCustomer(order.customerId);
    if (!customer) continue;

    if (order.deliveryDate) {
      const due = calendarDay(order.deliveryDate);
      if (due && (due === today || due === tomorrow || due < today)) {
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
