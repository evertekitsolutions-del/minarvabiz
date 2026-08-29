/**
 * Service orders + measurements store (Phase 4).
 * Shares customer lookup with main store.
 */

import type {
  ServiceOrder, MeasurementProfile, MeasurementFields, ServiceType,
  OrderStatus, OrderExpense, TshirtDetails, UUID,
} from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import {
  calculateOrderPricing, nextOrderNumber, validateOrderInput, canTransition,
} from "./orders";
import * as mainStore from "./store";
import { touchPersistence } from "./autosave";

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
  const profile: MeasurementProfile = {
    id: generateId(),
    customerId: input.customerId,
    label: input.label || "Default",
    fields: input.fields,
    notes: input.notes ?? null,
    recordedAt: nowISO(),
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  measurements.push(profile);
  return profile;
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
  const errors = validateOrderInput({
    customerId: input.customerId,
    serviceType: input.serviceType,
    price: input.price,
    deliveryDate: input.deliveryDate,
    tshirt: input.tshirt,
  });
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

  const orderNumber = nextOrderNumber(lastOrderNo);
  lastOrderNo = orderNumber;

  const order: ServiceOrder = {
    id: generateId(),
    orderNumber,
    customerId: input.customerId,
    customerName: customer.name,
    orderDate: nowISO(),
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
    createdAt: nowISO(),
    updatedAt: nowISO(),
    createdBy: input.createdBy ?? null,
    version: 1,
  };

  // Advance payment affects customer outstanding if balance remains
  if (pricing.balance > 0) {
    customer.outstandingBalance = round2(customer.outstandingBalance + pricing.balance);
  }
  if (pricing.advance > 0) {
    customer.totalSpending = round2(customer.totalSpending + pricing.advance);
  }
  customer.updatedAt = nowISO();

  orders.push(order);
  touchPersistence();
  return { order, errors: [] };
}

export function updateOrderStatus(
  id: UUID,
  status: OrderStatus
): { order: ServiceOrder | null; error?: string } {
  const order = getOrder(id);
  if (!order) return { order: null, error: "Order not found" };
  if (!canTransition(order.status, status)) {
    return { order: null, error: `Cannot change status from ${order.status} to ${status}` };
  }
  order.status = status;
  order.updatedAt = nowISO();
  order.version += 1;
  return { order };
}

export function addOrderExpense(
  orderId: UUID,
  description: string,
  amount: number
): { order: ServiceOrder | null; error?: string } {
  const order = getOrder(orderId);
  if (!order) return { order: null, error: "Order not found" };
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

// Seed a few demo orders
(function seed() {
  const custs = mainStore.listCustomers();
  if (custs.length === 0) return;
  const c = custs[0];
  saveMeasurementProfile({
    customerId: c.id,
    label: "Standard",
    fields: { shoulder: 14, chest: 36, waist: 30, hip: 38, sleeve: 22, length: 42 },
  });
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
