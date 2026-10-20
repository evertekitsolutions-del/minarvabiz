import { isDemoMode } from "./runtime-mode";
import { validateMoneyAmountInput } from "./service-order-price-draft";
import { assertPermission } from "./permissions";
import { assertBusinessDayOpen } from "./business-day-state";
/**
 * Service orders + measurements store (Phase 4).
 * Shares customer lookup with main store.
 */

import type {
  ServiceOrder, MeasurementProfile, MeasurementFields, ServiceType,
  OrderStatus, OrderExpense, PaymentMethod, TshirtDetails, UUID,
} from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import {
  calculateOrderPricing, nextOrderNumber, validateOrderInput, canTransition,
} from "./orders";
import { createMeasurementRevision, latestMeasurementRevision, measurementRevisionHistory } from "./measurement-revisions";
import "./quality-control-types";
import * as mainStore from "./store";
import { touchPersistence } from "./autosave";
import { remoteCreateOrder, remoteUpsertCustomer } from "./remote-write";
import { queueOrderStatusMessage } from "./customer-communication";
import { hasServiceOrderPosting, planServiceOrderCancellation, planServiceOrderPosting } from "./service-order-accounting";
import { auditAction } from "./audit-actions";
import { enqueueOutbox } from "./outbox-bridge";

const measurements: MeasurementProfile[] = [];
const orders: ServiceOrder[] = [];
let lastOrderNo: string | null = null;

export function listMeasurementProfiles(customerId: UUID): MeasurementProfile[] {
  return measurements
    .filter((m) => m.customerId === customerId && !m.deletedAt)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

export function saveMeasurementProfile(input: {
  customerId: UUID;
  label: string;
  fields: MeasurementFields;
  notes?: string | null;
}): MeasurementProfile {
  assertPermission("orders.manage");
  const previous = latestMeasurementProfile(input.customerId, input.label);
  const profile = createMeasurementRevision({
    customerId: input.customerId,
    label: input.label,
    fields: input.fields,
    notes: input.notes,
    previous,
  });
  measurements.push(profile);
  touchPersistence();
  return profile;
}

export function getMeasurementProfile(id: UUID): MeasurementProfile | undefined {
  return measurements.find((m) => m.id === id && !m.deletedAt);
}

export function latestMeasurementProfile(customerId: UUID, label = "Default"): MeasurementProfile | null {
  return latestMeasurementRevision(
    measurements.filter((profile) => profile.customerId === customerId),
    label
  );
}

export function listMeasurementHistory(
  customerId: UUID,
  label?: string
): MeasurementProfile[] {
  const profiles = listMeasurementProfiles(customerId);
  const latest = label
    ? latestMeasurementProfile(customerId, label)
    : latestMeasurementRevision(profiles, profiles[0]?.label ?? "Default");
  if (!latest) return [];
  return measurementRevisionHistory(profiles, latest);
}

export function listOrders(opts?: {
  status?: OrderStatus;
  serviceType?: ServiceType;
  customerId?: UUID;
  query?: string;
  orderDateFrom?: string;
  orderDateTo?: string;
  deliveryDateFrom?: string;
  deliveryDateTo?: string;
}): ServiceOrder[] {
  let list = orders.filter((o) => !o.deletedAt);
  if (opts?.status) list = list.filter((o) => o.status === opts.status);
  if (opts?.serviceType) list = list.filter((o) => o.serviceType === opts.serviceType);
  if (opts?.customerId) list = list.filter((o) => o.customerId === opts.customerId);
  if (opts?.orderDateFrom) list = list.filter((o) => o.orderDate.slice(0, 10) >= opts.orderDateFrom!);
  if (opts?.orderDateTo) list = list.filter((o) => o.orderDate.slice(0, 10) <= opts.orderDateTo!);
  if (opts?.deliveryDateFrom) list = list.filter((o) => Boolean(o.deliveryDate) && String(o.deliveryDate).slice(0, 10) >= opts.deliveryDateFrom!);
  if (opts?.deliveryDateTo) list = list.filter((o) => Boolean(o.deliveryDate) && String(o.deliveryDate).slice(0, 10) <= opts.deliveryDateTo!);
  if (opts?.query?.trim()) {
    const q = opts.query.toLowerCase();
    list = list.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.notes?.toLowerCase().includes(q)
    );
  }
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getOrder(id: UUID): ServiceOrder | undefined {
  return orders.find((o) => o.id === id && !o.deletedAt);
}

export function createOrder(input: {
  customerId: UUID;
  serviceType: ServiceType;
  deliveryDate?: string | null;
  price: number;
  discount?: number;
  advance?: number;
  advancePaymentMethod?: PaymentMethod;
  notes?: string | null;
  materialDetails?: string | null;
  customerSuppliedMaterial?: boolean;
  shopSuppliedMaterial?: boolean;
  measurements?: MeasurementFields | null;
  measurementProfileId?: UUID | null;
  assignedTailorId?: UUID | null;
  externalMaterialCost?: number;
  quantity?: number;
  unitPrice?: number;
  bulkDiscount?: number;
  tshirt?: TshirtDetails | null;
  createdBy?: UUID | null;
}): { order: ServiceOrder | null; errors: string[] } {
  assertPermission("orders.manage");
  assertBusinessDayOpen();
  const errors = validateOrderInput({
    customerId: input.customerId,
    serviceType: input.serviceType,
    price: input.price,
    deliveryDate: input.deliveryDate,
    tshirt: input.tshirt,
  });
  const moneyInputs = [
    ["Price", input.price],
    ["Discount", input.discount ?? 0],
    ["Advance", input.advance ?? 0],
    ["External material cost", input.externalMaterialCost ?? 0],
    ["Bulk discount", input.bulkDiscount ?? 0],
  ] as const;
  for (const [label, value] of moneyInputs) {
    if (!validateMoneyAmountInput(value).ok) {
      errors.push(label + " must be a finite non-negative amount with at most two decimal places");
    }
  }
  const advancePaymentMethod = input.advancePaymentMethod ?? "cash";
  if (!["cash", "bank", "card", "upi", "online", "other"].includes(advancePaymentMethod)) {
    errors.push("Invalid service order advance payment method");
  }
  if (input.unitPrice != null && !validateMoneyAmountInput(input.unitPrice).ok) {
    errors.push("Unit price must be a finite non-negative amount with at most two decimal places");
  }
  if (input.quantity != null && (!Number.isFinite(input.quantity) || input.quantity <= 0 || !Number.isSafeInteger(Math.round(input.quantity * 1000)))) {
    errors.push("Quantity must be positive and finite");
  }
  if (input.tshirt) {
    if (!Number.isFinite(input.tshirt.quantity) || input.tshirt.quantity <= 0 || !Number.isSafeInteger(Math.round(input.tshirt.quantity * 1000))) {
      errors.push("T-shirt quantity must be positive and finite");
    }
    for (const [label, value] of [["T-shirt printing cost", input.tshirt.printingCost], ["T-shirt customer price", input.tshirt.customerPrice]] as const) {
      if (!validateMoneyAmountInput(value).ok) errors.push(label + " must be a finite non-negative amount with at most two decimal places");
    }
  }
  if (errors.length) return { order: null, errors };

  const customer = mainStore.getCustomer(input.customerId);
  if (!customer) return { order: null, errors: ["Customer not found"] };

  const pricing = calculateOrderPricing({
    serviceType: input.serviceType,
    price: input.price,
    discount: input.discount,
    advance: input.advance,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    bulkDiscount: input.bulkDiscount,
    externalMaterialCost: input.externalMaterialCost,
    tshirt: input.tshirt,
  });
  const pricingValues = [pricing.netPrice, pricing.discount, pricing.advance, pricing.balance, pricing.externalMaterialCost, pricing.orderExpensesTotal];
  if (pricingValues.some((value) => !validateMoneyAmountInput(value).ok)) {
    return { order: null, errors: ["Service order totals are out of range"] };
  }
  if (!Number.isFinite(customer.outstandingBalance) || customer.outstandingBalance < 0
    || !Number.isSafeInteger(Math.round((customer.outstandingBalance + pricing.balance) * 100))
    || !Number.isFinite(customer.totalSpending) || customer.totalSpending < 0
    || !Number.isSafeInteger(Math.round((customer.totalSpending + pricing.advance) * 100))) {
    return { order: null, errors: ["Customer balance needs reconciliation"] };
  }

  const orderNumber = nextOrderNumber(lastOrderNo);
  const now = nowISO();
  const order: ServiceOrder = {
    id: generateId(),
    orderNumber,
    customerId: input.customerId,
    customerName: customer.name,
    orderDate: now,
    deliveryDate: input.deliveryDate ?? null,
    serviceType: input.serviceType,
    status: "pending",
    assignedTailorId: input.assignedTailorId ?? null,
    measurements: input.measurements ?? null,
    measurementProfileId: input.measurementProfileId ?? null,
    notes: input.notes ?? null,
    materialDetails: input.materialDetails ?? null,
    customerSuppliedMaterial: input.customerSuppliedMaterial ?? false,
    shopSuppliedMaterial: input.shopSuppliedMaterial ?? true,
    price: pricing.netPrice,
    discount: pricing.discount,
    advance: pricing.advance,
    balance: pricing.balance,
    externalMaterialCost: pricing.externalMaterialCost,
    orderExpensesTotal: pricing.orderExpensesTotal,
    quantity: pricing.quantity,
    unitPrice: input.unitPrice ?? pricing.netPrice,
    bulkDiscount: input.bulkDiscount ?? 0,
    tshirt: input.tshirt ?? null,
    expenses: [],
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy ?? null,
    version: 1,
  };
  const posting = planServiceOrderPosting(order, advancePaymentMethod);
  if (posting.errors.length) return { order: null, errors: posting.errors };
  // An unpaid or partly paid charge must not be published as an order if its
  // debit/credit journal was not committed. Free-of-charge orders keep their
  // existing legitimate no-journal behavior.
  const journal = posting.commit();
  if (pricing.netPrice > 0 && !journal) {
    return { order: null, errors: ["Service order accounting journal was not committed"] };
  }

  lastOrderNo = orderNumber;
  if (pricing.balance > 0) customer.outstandingBalance = round2(customer.outstandingBalance + pricing.balance);
  if (pricing.advance > 0) customer.totalSpending = round2(customer.totalSpending + pricing.advance);
  customer.updatedAt = now;

  orders.push(order);
  touchPersistence();
  void remoteCreateOrder({ ...order });
  if (pricing.advance > 0) {
    mainStore.recordOrderAdvancePaymentEntry({
      orderId: order.id,
      customerId: order.customerId,
      amount: pricing.advance,
      method: advancePaymentMethod,
      paidAt: order.orderDate,
    });
  }
  void remoteUpsertCustomer({ ...customer });
  auditAction("service_order.create", "orders", order.id, null, {
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    serviceType: order.serviceType,
    price: order.price,
    advance: order.advance,
    balance: order.balance,
    advancePaymentMethod,
  });
  return { order, errors: [] };
}

export function updateOrderOperationalDetails(
  id: UUID,
  input: { deliveryDate?: string | null; notes?: string | null; materialDetails?: string | null },
  reason: string
): { order: ServiceOrder | null; errors: string[] } {
  assertPermission("orders.manage");
  const order = getOrder(id);
  if (!order) return { order: null, errors: ["Order not found"] };
  if (order.status === "delivered" || order.status === "cancelled") {
    return { order: null, errors: ["Delivered or cancelled orders are immutable"] };
  }
  const changeReason = reason.trim();
  if (changeReason.length < 3) return { order: null, errors: ["Change reason is required"] };

  const before = structuredClone(order);
  const deliveryDate = input.deliveryDate === undefined ? order.deliveryDate ?? null : input.deliveryDate || null;
  const notes = input.notes === undefined ? order.notes ?? null : input.notes?.trim() || null;
  const materialDetails = input.materialDetails === undefined ? order.materialDetails ?? null : input.materialDetails?.trim() || null;
  const changed = deliveryDate !== (order.deliveryDate ?? null)
    || notes !== (order.notes ?? null)
    || materialDetails !== (order.materialDetails ?? null);
  if (!changed) return { order: null, errors: ["No operational changes to save"] };

  order.deliveryDate = deliveryDate;
  order.notes = notes;
  order.materialDetails = materialDetails;
  order.updatedAt = nowISO();
  order.version += 1;
  enqueueOutbox("orders", order.id, "update", { ...order });
  auditAction("service_order.update", "orders", order.id, before, {
    order: { ...order },
    changeReason,
  });
  touchPersistence();
  return { order, errors: [] };
}

export function updateOrderStatus(
  id: UUID,
  status: OrderStatus,
  options?: { refundPaymentMethod?: PaymentMethod; reason?: string }
): { order: ServiceOrder | null; error?: string } {
  assertPermission("orders.manage");
  assertBusinessDayOpen();
  const order = getOrder(id);
  if (!order) return { order: null, error: "Order not found" };
  if (!canTransition(order.status, status)) {
    return { order: null, error: `Cannot change status from ${order.status} to ${status}` };
  }

  if (status === "cancelled") {
    const cancellationReason = options?.reason?.trim() ?? "";
    if (cancellationReason.length < 3) return { order: null, error: "Cancellation reason is required" };
    if (!Number.isFinite(order.advance) || !Number.isFinite(order.balance) || !Number.isFinite(order.price)
      || order.advance < 0 || order.balance < 0 || order.price < 0
      || !Number.isSafeInteger(Math.round(order.advance * 100))
      || !Number.isSafeInteger(Math.round(order.balance * 100))
      || !Number.isSafeInteger(Math.round(order.price * 100))
      || round2(order.advance + order.balance) !== round2(order.price)) {
      return { order: null, error: "Service order balances need reconciliation" };
    }
    const refundPaymentMethod = options?.refundPaymentMethod;
    if (round2(order.advance) > 0 && !refundPaymentMethod) {
      return { order: null, error: "Refund method is required for the service-order advance before cancellation" };
    }
    const customer = mainStore.getCustomer(order.customerId);
    if (!customer || !Number.isFinite(customer.outstandingBalance) || customer.outstandingBalance < order.balance
      || !Number.isSafeInteger(Math.round(customer.outstandingBalance * 100))
      || !Number.isFinite(customer.totalSpending) || customer.totalSpending < order.advance
      || !Number.isSafeInteger(Math.round(customer.totalSpending * 100))) {
      return { order: null, error: "Customer balance needs reconciliation before cancellation" };
    }
    const hasUnallocatedCollection = mainStore.listPayments().some((payment) =>
      payment.customerId === order.customerId
      && payment.referenceType === "other"
      && payment.paidAt >= order.createdAt
      && /Other customer balance:/i.test(payment.notes ?? "")
    );
    if (hasUnallocatedCollection) {
      return { order: null, error: "Customer collections need allocation before service-order cancellation" };
    }
    const reversal = planServiceOrderCancellation(order, refundPaymentMethod);
    if (reversal.errors.length) return { order: null, error: reversal.errors.join("; ") };

    // A failed reversal must not cancel the operational order, lower a
    // customer's receivable or create a refund without a posted journal.
    // The posting is already reconciled and idempotent by order source ID.
    if (!reversal.commit()) {
      return { order: null, error: "Service order cancellation journal was not committed" };
    }

    const beforeOrder = { ...order };
    const beforeCustomer = { ...customer };
    const now = nowISO();
    customer.outstandingBalance = round2(customer.outstandingBalance - order.balance);
    customer.totalSpending = round2(customer.totalSpending - order.advance);
    customer.updatedAt = now;
    order.status = "cancelled";
    order.updatedAt = now;
    order.version += 1;
    const refundPayment = order.advance > 0 && refundPaymentMethod
      ? mainStore.recordOrderRefundPaymentEntry({
          orderId: order.id,
          customerId: order.customerId,
          amount: order.advance,
          method: refundPaymentMethod,
          refundedAt: now,
        })
      : null;
    enqueueOutbox("orders", order.id, "update", { ...order });
    void remoteUpsertCustomer({ ...customer });
    auditAction("service_order.cancel", "orders", order.id, beforeOrder, {
      order: { ...order },
      refundPaymentId: refundPayment?.id ?? null,
      refundAmount: refundPayment?.amount ?? 0,
      refundPaymentMethod: refundPayment?.method ?? null,
      customerOutstandingBefore: beforeCustomer.outstandingBalance,
      customerOutstandingAfter: customer.outstandingBalance,
      customerSpendingBefore: beforeCustomer.totalSpending,
      customerSpendingAfter: customer.totalSpending,
      cancellationReason,
    });
    touchPersistence();
    queueOrderStatusMessage(order, customer);
    return { order };
  }

  const beforeOrder = structuredClone(order);
  order.status = status;
  order.updatedAt = nowISO();
  order.version += 1;
  enqueueOutbox("orders", order.id, "update", { ...order });
  auditAction("service_order.status", "orders", order.id, beforeOrder, {
    order: { ...order },
    reason: options?.reason?.trim() || null,
  });
  touchPersistence();

  // Queue the customer update after the order mutation. The queue itself is
  // persisted by the existing SQLite domain snapshot/outbox pipeline.
  queueOrderStatusMessage(order, mainStore.getCustomer(order.customerId));
  return { order };
}

/** Check linked cost consistency before source journals or master records are created. */
export function preflightOrderExpenseAddition(
  orderId: UUID,
  amount: number,
  sourceExpenseId?: UUID
): { order: ServiceOrder | null; error?: string; amountCents?: number; nextCents?: number } {
  assertPermission("orders.manage");
  assertBusinessDayOpen();
  const order = getOrder(orderId);
  if (!order) return { order: null, error: "Order not found" };
  const amountCents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amountCents <= 0 || !Number.isSafeInteger(amountCents)
    || Math.abs(amount - amountCents / 100) > Math.min(1e-9, 4 * Number.EPSILON * Math.max(1, Math.abs(amount)))) {
    return { order: null, error: "Order expense amount must be positive and finite with valid cent precision" };
  }
  const oldCents = Math.round(order.orderExpensesTotal * 100);
  const nextCents = oldCents + amountCents;
  if (!Number.isFinite(order.orderExpensesTotal) || order.orderExpensesTotal < 0
    || !Number.isSafeInteger(oldCents) || !Number.isSafeInteger(nextCents)
    || Math.abs(order.orderExpensesTotal - oldCents / 100)
      > Math.min(1e-9, 4 * Number.EPSILON * Math.max(1, Math.abs(order.orderExpensesTotal)))) {
    return { order: null, error: "Order expense total needs reconciliation" };
  }
  if (sourceExpenseId && order.expenses.some((item) => item.id === sourceExpenseId)) {
    return { order: null, error: "Order expense source already exists" };
  }
  return { order, amountCents, nextCents };
}

export function addOrderExpense(
  orderId: UUID,
  description: string,
  amount: number,
  sourceExpenseId?: UUID
): { order: ServiceOrder | null; error?: string } {
  const check = preflightOrderExpenseAddition(orderId, amount, sourceExpenseId);
  if (!check.order || check.amountCents === undefined || check.nextCents === undefined) {
    return { order: null, error: check.error || "Order expense preflight failed" };
  }
  const { order, amountCents, nextCents } = check;
  const exp: OrderExpense = {
    id: sourceExpenseId ?? generateId(),
    orderId,
    description,
    amount: amountCents / 100,
    createdAt: nowISO(),
  };
  order.expenses.push(exp);
  order.orderExpensesTotal = nextCents / 100;
  order.updatedAt = nowISO();
  order.version += 1;
  enqueueOutbox("orders", order.id, "update", { ...order, expenses: order.expenses.map((item) => ({ ...item })) });
  touchPersistence();
  return { order };
}

/** Preflight an order expense reversal without touching the order or sync queue. */
export function preflightOrderExpenseRemoval(
  orderId: UUID,
  expenseId: UUID,
  expectedAmount: number
): { order: ServiceOrder | null; error?: string; index?: number; nextCents?: number } {
  assertPermission("orders.manage");
  assertBusinessDayOpen();
  const order = getOrder(orderId);
  if (!order) return { order: null, error: "Order not found" };
  const index = order.expenses.findIndex(item => item.id === expenseId);
  if (index < 0) return { order: null, error: "Order-linked expense needs source reconciliation" };
  const item = order.expenses[index];
  const expectedCents = Math.round(expectedAmount * 100);
  const itemCents = Math.round(item.amount * 100);
  const centExact = (value: number, cents: number) =>
    Number.isFinite(value) && value > 0 && Number.isSafeInteger(cents) && cents > 0
      && Math.abs(value - cents / 100) <= Math.min(1e-9, 4 * Number.EPSILON * Math.max(1, Math.abs(value)));
  if (!centExact(expectedAmount, expectedCents) || !centExact(item.amount, itemCents)
    || expectedCents !== itemCents) {
    return { order: null, error: "Order-linked expense amount needs reconciliation" };
  }
  const totalCents = Math.round(order.orderExpensesTotal * 100);
  if (!Number.isFinite(order.orderExpensesTotal) || order.orderExpensesTotal < 0
    || !Number.isSafeInteger(totalCents) || totalCents < itemCents
    || Math.abs(order.orderExpensesTotal - totalCents / 100)
       > Math.min(1e-9, 4 * Number.EPSILON * Math.max(1, Math.abs(order.orderExpensesTotal)))) {
    return { order: null, error: "Order expense total needs reconciliation" };
  }
  return { order, index, nextCents: totalCents - itemCents };
}

export function removeOrderExpense(
  orderId: UUID,
  expenseId: UUID,
  expectedAmount: number
): { order: ServiceOrder | null; error?: string } {
  const check = preflightOrderExpenseRemoval(orderId, expenseId, expectedAmount);
  if (!check.order || check.index === undefined || check.nextCents === undefined) {
    return { order: null, error: check.error || "Order expense reversal preflight failed" };
  }
  const { order, index, nextCents } = check;
  order.expenses.splice(index, 1);
  order.orderExpensesTotal = nextCents / 100;
  order.updatedAt = nowISO();
  order.version += 1;
  enqueueOutbox("orders", order.id, "update", { ...order, expenses: order.expenses.map(item => ({ ...item })) });
  touchPersistence();
  return { order };
}

export function getOrderProfit(orderId: UUID) {
  const order = getOrder(orderId);
  if (!order) return null;
  return calculateOrderPricing({
    serviceType: order.serviceType,
    price: order.price + order.discount,
    discount: order.discount,
    advance: order.advance,
    quantity: order.quantity,
    unitPrice: order.unitPrice,
    bulkDiscount: order.bulkDiscount,
    externalMaterialCost: order.externalMaterialCost,
    orderExpensesTotal: order.orderExpensesTotal,
    tshirt: order.tshirt,
  });
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

mainStore.registerCustomerReceivableProvider("service_orders", {
  list(customerId) {
    return orders
      .filter((order) => !order.deletedAt && order.customerId === customerId && order.status !== "cancelled" && order.balance > 0)
      .map((order) => ({
        id: order.id,
        label: order.orderNumber,
        date: order.orderDate,
        balance: order.balance,
        postedReceivable: hasServiceOrderPosting(order.id),
        sourceType: "service_order" as const,
      }));
  },
  validate(allocations) {
    for (const { item, amount } of allocations) {
      const order = getOrder(item.id);
      if (!order || order.status === "cancelled") return "Service order collection target is no longer available";
      if (!Number.isFinite(order.advance) || !Number.isFinite(order.balance) || amount <= 0 || amount > order.balance
        || !Number.isSafeInteger(Math.round((order.advance + amount) * 100))
        || !Number.isSafeInteger(Math.round((order.balance - amount) * 100))) {
        return "Service order balances need reconciliation";
      }
    }
    return null;
  },
  apply(allocations, now) {
    for (const { item, amount } of allocations) {
      const order = getOrder(item.id);
      if (!order || order.status === "cancelled") throw new Error("Service order collection target is no longer available");
      if (!Number.isFinite(order.advance) || !Number.isFinite(order.balance) || amount <= 0 || amount > order.balance
        || !Number.isSafeInteger(Math.round((order.advance + amount) * 100))
        || !Number.isSafeInteger(Math.round((order.balance - amount) * 100))) {
        throw new Error("Service order balances need reconciliation");
      }
      const before = { advance: order.advance, balance: order.balance, version: order.version };
      order.advance = round2(order.advance + amount);
      order.balance = round2(order.balance - amount);
      order.updatedAt = now;
      order.version += 1;
      enqueueOutbox("orders", order.id, "update", { ...order, expenses: order.expenses.map((expense) => ({ ...expense })) });
      void remoteCreateOrder({ ...order, expenses: order.expenses.map((expense) => ({ ...expense })) });
      auditAction("service_order.collection", "orders", order.id, before, {
        advance: order.advance,
        balance: order.balance,
        amount,
      });
    }
    touchPersistence();
  },
});

(function seed() {
  if (!isDemoMode()) return;
  const custs = mainStore.listCustomers();
  if (custs.length === 0) return;
  const c = custs[0];
  if (!latestMeasurementProfile(c.id, "Standard")) {
    const profile = createMeasurementRevision({
      customerId: c.id,
      label: "Standard",
      fields: { shoulder: 14, chest: 36, waist: 30, hip: 38, sleeve: 22, length: 42 },
      notes: "Demo seed",
      previous: null,
    });
    measurements.push(profile);
  }
})();

export function hydrateOrders(data: {
  orders?: ServiceOrder[];
  measurements?: MeasurementProfile[];
}) {
  if (data.orders) {
    orders.length = 0;
    orders.push(...data.orders);
  }
  if (data.measurements) {
    measurements.length = 0;
    measurements.push(...data.measurements);
  }
}
