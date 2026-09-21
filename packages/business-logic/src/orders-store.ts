import { isDemoMode } from "./runtime-mode";
import { assertPermission } from "./permissions";
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
}): ServiceOrder[] {
  let list = orders.filter((o) => !o.deletedAt);
  if (opts?.status) list = list.filter((o) => o.status === opts.status);
  if (opts?.serviceType) list = list.filter((o) => o.serviceType === opts.serviceType);
  if (opts?.customerId) list = list.filter((o) => o.customerId === opts.customerId);
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
    if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100))) {
      errors.push(label + " must be a finite non-negative amount");
    }
  }
  const advancePaymentMethod = input.advancePaymentMethod ?? "cash";
  if (!["cash", "bank", "card", "upi", "online", "other"].includes(advancePaymentMethod)) {
    errors.push("Invalid service order advance payment method");
  }
  if (input.unitPrice != null && (!Number.isFinite(input.unitPrice) || input.unitPrice < 0 || !Number.isSafeInteger(Math.round(input.unitPrice * 100)))) {
    errors.push("Unit price must be a finite non-negative amount");
  }
  if (input.quantity != null && (!Number.isFinite(input.quantity) || input.quantity <= 0 || !Number.isSafeInteger(Math.round(input.quantity * 1000)))) {
    errors.push("Quantity must be positive and finite");
  }
  if (input.tshirt) {
    if (!Number.isFinite(input.tshirt.quantity) || input.tshirt.quantity <= 0 || !Number.isSafeInteger(Math.round(input.tshirt.quantity * 1000))) {
      errors.push("T-shirt quantity must be positive and finite");
    }
    for (const [label, value] of [["T-shirt printing cost", input.tshirt.printingCost], ["T-shirt customer price", input.tshirt.customerPrice]] as const) {
      if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100))) errors.push(label + " must be a finite non-negative amount");
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
  if (pricingValues.some((value) => !Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100)))) {
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

  lastOrderNo = orderNumber;
  if (pricing.balance > 0) customer.outstandingBalance = round2(customer.outstandingBalance + pricing.balance);
  if (pricing.advance > 0) customer.totalSpending = round2(customer.totalSpending + pricing.advance);
  customer.updatedAt = now;

  orders.push(order);
  posting.commit();
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

export function updateOrderStatus(
  id: UUID,
  status: OrderStatus
): { order: ServiceOrder | null; error?: string } {
  assertPermission("orders.manage");
  const order = getOrder(id);
  if (!order) return { order: null, error: "Order not found" };
  if (!canTransition(order.status, status)) {
    return { order: null, error: `Cannot change status from ${order.status} to ${status}` };
  }

  if (status === "cancelled") {
    if (!Number.isFinite(order.advance) || !Number.isFinite(order.balance) || order.advance < 0 || order.balance < 0
      || !Number.isSafeInteger(Math.round(order.advance * 100)) || !Number.isSafeInteger(Math.round(order.balance * 100))) {
      return { order: null, error: "Service order balances need reconciliation" };
    }
    if (round2(order.advance) > 0) {
      return { order: null, error: "Refund the service-order advance before cancellation" };
    }
    const customer = mainStore.getCustomer(order.customerId);
    if (!customer || !Number.isFinite(customer.outstandingBalance) || customer.outstandingBalance < order.balance
      || !Number.isSafeInteger(Math.round(customer.outstandingBalance * 100))) {
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
    const reversal = planServiceOrderCancellation(order);
    if (reversal.errors.length) return { order: null, error: reversal.errors.join("; ") };

    const beforeOrder = { ...order };
    const beforeCustomer = { ...customer };
    const now = nowISO();
    customer.outstandingBalance = round2(customer.outstandingBalance - order.balance);
    customer.updatedAt = now;
    order.status = "cancelled";
    order.updatedAt = now;
    order.version += 1;
    reversal.commit();
    enqueueOutbox("orders", order.id, "update", { ...order });
    void remoteUpsertCustomer({ ...customer });
    auditAction("service_order.cancel", "orders", order.id, beforeOrder, {
      order: { ...order },
      customerBefore: beforeCustomer.outstandingBalance,
      customerAfter: customer.outstandingBalance,
    });
    touchPersistence();
    queueOrderStatusMessage(order, customer);
    return { order };
  }

  order.status = status;
  order.updatedAt = nowISO();
  order.version += 1;
  touchPersistence();

  // Queue the customer update after the order mutation. The queue itself is
  // persisted by the existing SQLite domain snapshot/outbox pipeline.
  queueOrderStatusMessage(order, mainStore.getCustomer(order.customerId));
  return { order };
}

export function addOrderExpense(
  orderId: UUID,
  description: string,
  amount: number
): { order: ServiceOrder | null; error?: string } {
  assertPermission("orders.manage");
  const order = getOrder(orderId);
  if (!order) return { order: null, error: "Order not found" };
  if (!Number.isFinite(amount) || round2(amount) <= 0 || !Number.isSafeInteger(Math.round(amount * 100))) {
    return { order: null, error: "Order expense amount must be positive and finite" };
  }
  const exp: OrderExpense = {
    id: generateId(),
    orderId,
    description,
    amount: round2(amount),
    createdAt: nowISO(),
  };
  order.expenses.push(exp);
  order.orderExpensesTotal = round2(order.orderExpensesTotal + exp.amount);
  order.updatedAt = nowISO();
  order.version += 1;
  enqueueOutbox("orders", order.id, "update", { ...order, expenses: order.expenses.map((item) => ({ ...item })) });
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

mainStore.registerCustomerReceivableProvider({
  list(customerId) {
    return orders
      .filter((order) => !order.deletedAt && order.customerId === customerId && order.status !== "cancelled" && order.balance > 0)
      .map((order) => ({
        id: order.id,
        label: order.orderNumber,
        date: order.orderDate,
        balance: order.balance,
        postedReceivable: hasServiceOrderPosting(order.id),
      }));
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
