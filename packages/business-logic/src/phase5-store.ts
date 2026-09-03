import { assertPermission } from "./permissions";
import { enqueueOutbox } from "./outbox-bridge";
/**
 * Phase 5 store: suppliers, laundry, expenses, purchases.
 * Order-specific purchases/expenses link into ordersStore profit.
 */

import type {
  Supplier, LaundryOrder, Expense, ExpenseCategory, Purchase,
  PaymentMethod, UUID,
} from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { calculateLaundryProfit } from "./laundry";
import { purchaseBalance, nextDocNumber } from "./expenses";
import * as mainStore from "./store";
import * as ordersStore from "./orders-store";
import { touchPersistence } from "./autosave";

const suppliers: Supplier[] = [
  {
    id: "sup-1", name: "City Laundry Works", company: "CLW", phone: "9800011111",
    category: "laundry", openingBalance: 0, outstandingBalance: 0,
    createdAt: nowISO(), updatedAt: nowISO(),
  },
  {
    id: "sup-2", name: "Thread & Co.", company: "T&C Supplies", phone: "9800022222",
    category: "materials", openingBalance: 0, outstandingBalance: 0,
    createdAt: nowISO(), updatedAt: nowISO(),
  },
];

const expenseCategories: ExpenseCategory[] = [
  { id: "ec-1", name: "Salary", isSystem: true, createdAt: nowISO() },
  { id: "ec-2", name: "Electricity", isSystem: true, createdAt: nowISO() },
  { id: "ec-3", name: "Rent", isSystem: true, createdAt: nowISO() },
  { id: "ec-4", name: "Normal Water", isSystem: true, createdAt: nowISO() },
  { id: "ec-5", name: "Drinking Water", isSystem: true, createdAt: nowISO() },
  { id: "ec-6", name: "Shop Supplies", isSystem: true, createdAt: nowISO() },
  { id: "ec-7", name: "Transportation", isSystem: true, createdAt: nowISO() },
  { id: "ec-8", name: "Maintenance", isSystem: true, createdAt: nowISO() },
  { id: "ec-9", name: "Other", isSystem: true, createdAt: nowISO() },
];

const laundryOrders: LaundryOrder[] = [];
const expenses: Expense[] = [];
const purchases: Purchase[] = [];
let lastLaundryNo: string | null = null;
let lastPurchaseNo: string | null = null;

// ---- Suppliers ----
export function listSuppliers(query?: string): Supplier[] {
  let list = suppliers.filter((s) => !s.deletedAt);
  if (query?.trim()) {
    const q = query.toLowerCase();
    list = list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.company?.toLowerCase().includes(q) ||
        s.phone?.includes(q)
    );
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

export function getSupplier(id: UUID): Supplier | undefined {
  return suppliers.find((s) => s.id === id && !s.deletedAt);
}

export function createSupplier(input: {
  name: string;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  category?: string | null;
  notes?: string | null;
  openingBalance?: number;
}): Supplier {
  assertPermission("purchases.manage");
  const s: Supplier = {
    id: generateId(),
    name: input.name,
    company: input.company ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    category: input.category ?? null,
    openingBalance: input.openingBalance ?? 0,
    outstandingBalance: input.openingBalance ?? 0,
    notes: input.notes ?? null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  suppliers.push(s);
  touchPersistence();
  enqueueOutbox("suppliers", s.id, "insert", s);
  return s;
}

// ---- Laundry ----
export function listLaundryOrders(opts?: {
  mode?: "outsourced" | "in_house_ironing";
  query?: string;
}): LaundryOrder[] {
  let list = laundryOrders.filter((o) => !o.deletedAt);
  if (opts?.mode) list = list.filter((o) => o.mode === opts.mode);
  if (opts?.query?.trim()) {
    const q = opts.query.toLowerCase();
    list = list.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.garment?.toLowerCase().includes(q)
    );
  }
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createLaundryOrder(input: {
  customerId: UUID;
  garment?: string | null;
  quantity: number;
  mode: "outsourced" | "in_house_ironing";
  supplierId?: UUID | null;
  supplierRate: number;
  customerRate: number;
  notes?: string | null;
  paidAmount?: number;
  paymentMethod?: PaymentMethod;
}): { order: LaundryOrder | null; errors: string[] } {
  assertPermission("orders.manage");
  const errors: string[] = [];
  if (!input.customerId) errors.push("Customer is required");
  if (input.quantity <= 0) errors.push("Quantity must be positive");
  if (input.customerRate < 0) errors.push("Customer rate cannot be negative");
  if (input.mode === "outsourced" && !input.supplierId) {
    errors.push("Supplier is required for outsourced laundry");
  }
  if (errors.length) return { order: null, errors };

  const customer = mainStore.getCustomer(input.customerId);
  if (!customer) return { order: null, errors: ["Customer not found"] };

  const supplierRate = input.mode === "in_house_ironing" ? 0 : input.supplierRate;
  const calc = calculateLaundryProfit({
    customerRate: input.customerRate,
    supplierRate,
    quantity: input.quantity,
  });

  const supplier = input.supplierId ? getSupplier(input.supplierId) : undefined;
  const paid = Math.min(input.paidAmount ?? 0, calc.totalCustomerCharge);
  const balance = Math.max(0, calc.totalCustomerCharge - paid);

  const orderNumber = nextDocNumber(lastLaundryNo, "LDY");
  lastLaundryNo = orderNumber;

  const order: LaundryOrder = {
    id: generateId(),
    orderNumber,
    customerId: input.customerId,
    customerName: customer.name,
    garment: input.garment ?? null,
    quantity: input.quantity,
    mode: input.mode,
    supplierId: input.supplierId ?? null,
    supplierName: supplier?.name ?? null,
    supplierRate,
    customerRate: input.customerRate,
    profit: calc.totalProfit,
    totalCustomerCharge: calc.totalCustomerCharge,
    totalSupplierCost: calc.totalSupplierCost,
    status: input.mode === "in_house_ironing" ? "delivered" : "pending",
    notes: input.notes ?? null,
    paidAmount: paid,
    balanceAmount: balance,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    version: 1,
  };

  if (balance > 0) {
    customer.outstandingBalance = r2(customer.outstandingBalance + balance);
  }
  if (paid > 0) {
    customer.totalSpending = r2(customer.totalSpending + paid);
  }
  customer.updatedAt = nowISO();

  if (supplier && calc.totalSupplierCost > 0) {
    supplier.outstandingBalance = r2(supplier.outstandingBalance + calc.totalSupplierCost);
    supplier.updatedAt = nowISO();
  }

  laundryOrders.push(order);
  touchPersistence();
  enqueueOutbox("laundry_orders", order.id, "insert", order);
  return { order, errors: [] };
}

export function updateLaundryStatus(
  id: UUID,
  status: LaundryOrder["status"]
): LaundryOrder | null {
  assertPermission("orders.manage");
  const o = laundryOrders.find((x) => x.id === id && !x.deletedAt);
  if (!o) return null;
  o.status = status;
  o.updatedAt = nowISO();
  o.version += 1;
  touchPersistence();
  enqueueOutbox("laundry_orders", o.id, "update", o);
  return o;
}

// ---- Expense categories & expenses ----
export function listExpenseCategories(): ExpenseCategory[] {
  return [...expenseCategories];
}

export function createExpenseCategory(name: string): ExpenseCategory {
  assertPermission("expenses.manage");
  const c: ExpenseCategory = {
    id: generateId(),
    name,
    isSystem: false,
    createdAt: nowISO(),
  };
  expenseCategories.push(c);
  touchPersistence();
  enqueueOutbox("expense_categories", c.id, "insert", c);
  return c;
}

export function listExpenses(opts?: { orderId?: UUID }): Expense[] {
  let list = expenses.filter((e) => !e.deletedAt);
  if (opts?.orderId) list = list.filter((e) => e.orderId === opts.orderId);
  return list.sort((a, b) => b.date.localeCompare(a.date));
}

export function createExpense(input: {
  date?: string;
  categoryId: UUID;
  amount: number;
  paymentMethod: PaymentMethod;
  description?: string | null;
  reference?: string | null;
  orderId?: UUID | null;
}): { expense: Expense | null; errors: string[] } {
  assertPermission("expenses.manage");
  const errors: string[] = [];
  if (input.amount <= 0) errors.push("Amount must be positive");
  const cat = expenseCategories.find((c) => c.id === input.categoryId);
  if (!cat) errors.push("Category required");
  if (errors.length) return { expense: null, errors };

  let orderNumber: string | null = null;
  if (input.orderId) {
    const order = ordersStore.getOrder(input.orderId);
    if (!order) return { expense: null, errors: ["Order not found"] };
    orderNumber = order.orderNumber;
    ordersStore.addOrderExpense(input.orderId, input.description || "Expense", input.amount);
  }

  const expense: Expense = {
    id: generateId(),
    date: input.date || nowISO(),
    categoryId: input.categoryId,
    categoryName: cat.name,
    amount: r2(input.amount),
    paymentMethod: input.paymentMethod,
    description: input.description ?? null,
    reference: input.reference ?? null,
    orderId: input.orderId ?? null,
    orderNumber,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    version: 1,
  };
  expenses.push(expense);
  touchPersistence();
  enqueueOutbox("expenses", expense.id, "insert", expense);
  return { expense, errors: [] };
}

// ---- Purchases ----
export function listPurchases(opts?: { kind?: "general" | "order_specific" }): Purchase[] {
  let list = purchases.filter((p) => !p.deletedAt);
  if (opts?.kind) list = list.filter((p) => p.kind === opts.kind);
  return list.sort((a, b) => b.date.localeCompare(a.date));
}

export function createPurchase(input: {
  date?: string;
  supplierId?: UUID | null;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paidAmount?: number;
  kind: "general" | "order_specific";
  orderId?: UUID | null;
  notes?: string | null;
}): { purchase: Purchase | null; errors: string[] } {
  assertPermission("purchases.manage");
  const errors: string[] = [];
  if (!input.description.trim()) errors.push("Description required");
  if (input.amount <= 0) errors.push("Amount must be positive");
  if (input.kind === "order_specific" && !input.orderId) {
    errors.push("Order is required for order-specific purchase");
  }
  if (errors.length) return { purchase: null, errors };

  const bal = purchaseBalance(input.amount, input.paidAmount ?? 0);
  const supplier = input.supplierId ? getSupplier(input.supplierId) : undefined;
  let orderNumber: string | null = null;

  if (input.orderId) {
    const order = ordersStore.getOrder(input.orderId);
    if (!order) return { purchase: null, errors: ["Order not found"] };
    orderNumber = order.orderNumber;
    ordersStore.addOrderExpense(input.orderId, input.description || "Order purchase", bal.amount);
  }

  const purchaseNumber = nextDocNumber(lastPurchaseNo, "PUR");
  lastPurchaseNo = purchaseNumber;

  const purchase: Purchase = {
    id: generateId(),
    purchaseNumber,
    date: input.date || nowISO(),
    supplierId: input.supplierId ?? null,
    supplierName: supplier?.name ?? null,
    description: input.description,
    amount: bal.amount,
    paymentMethod: input.paymentMethod,
    paidAmount: bal.paidAmount,
    balanceAmount: bal.balanceAmount,
    kind: input.kind,
    orderId: input.orderId ?? null,
    orderNumber,
    notes: input.notes ?? null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    version: 1,
  };

  if (supplier && bal.balanceAmount > 0) {
    supplier.outstandingBalance = r2(supplier.outstandingBalance + bal.balanceAmount);
    supplier.updatedAt = nowISO();
  }

  purchases.push(purchase);
  touchPersistence();
  enqueueOutbox("purchases", purchase.id, "insert", purchase);
  return { purchase, errors: [] };
}

function r2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function hydratePhase5(data: {
  suppliers?: Supplier[];
  laundryOrders?: LaundryOrder[];
  expenses?: Expense[];
  purchases?: Purchase[];
  expenseCategories?: ExpenseCategory[];
}) {
  if (data.suppliers) {
    suppliers.length = 0;
    suppliers.push(...data.suppliers);
  }
  if (data.laundryOrders) {
    laundryOrders.length = 0;
    laundryOrders.push(...data.laundryOrders);
  }
  if (data.expenses) {
    expenses.length = 0;
    expenses.push(...data.expenses);
  }
  if (data.purchases) {
    purchases.length = 0;
    purchases.push(...data.purchases);
  }
  if (data.expenseCategories) {
    expenseCategories.length = 0;
    expenseCategories.push(...data.expenseCategories);
  }
}
