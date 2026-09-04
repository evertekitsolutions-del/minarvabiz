import { allowDemoSeed } from "./runtime-mode";

import type {
  Customer, Product, Category, Sale, SaleItem, Payment, CartLine, UUID, PaymentMethod,
} from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import {
  calculateCartTotals, cartLineToSaleItem, allocatePayment, validateCart, nextInvoiceNumber,
} from "./sales";
import { applyStockMovement, isLowStock } from "./inventory";
import { touchPersistence } from "./autosave";
import { remoteUpsertCustomer, remoteUpsertProduct, remoteCreateSale } from "./remote-write";
import { auditAction } from "./audit-actions";
import { enqueueOutbox } from "./outbox-bridge";
import { assertPermission } from "./permissions";

const categories: Category[] = [];
const customers: Customer[] = [];
const products: Product[] = [];

if (allowDemoSeed()) {
  categories.push(
    { id: "cat-1", name: "Ornaments", isActive: true, createdAt: nowISO(), updatedAt: nowISO() },
    { id: "cat-2", name: "Materials", isActive: true, createdAt: nowISO(), updatedAt: nowISO() },
    { id: "cat-3", name: "Readymade Garments", isActive: true, createdAt: nowISO(), updatedAt: nowISO() },
    { id: "cat-4", name: "Ladies Inners", isActive: true, createdAt: nowISO(), updatedAt: nowISO() },
    { id: "cat-5", name: "Ladies Bags", isActive: true, createdAt: nowISO(), updatedAt: nowISO() },
    { id: "cat-6", name: "Ladies Own Products", isActive: true, createdAt: nowISO(), updatedAt: nowISO() },
  );
  customers.push(
    { id: "cust-1", name: "Neha Sharma", phone: "9876543210", whatsapp: "9876543210", email: "neha@example.com", outstandingBalance: 2500, totalSpending: 45000, createdAt: nowISO(), updatedAt: nowISO() },
    { id: "cust-2", name: "Anjali Menon", phone: "9876501234", outstandingBalance: 0, totalSpending: 82000, createdAt: nowISO(), updatedAt: nowISO() },
    { id: "cust-3", name: "Priya R.", phone: "9123456780", outstandingBalance: 1200, totalSpending: 15600, createdAt: nowISO(), updatedAt: nowISO() },
  );
  products.push(
    { id: "prod-1", name: "Silk Thread Gold", sku: "THR-001", barcode: "8901001001", categoryId: "cat-2", unit: "box", costPrice: 80, sellingPrice: 120, stockQuantity: 45, minimumStock: 10, isActive: true, createdAt: nowISO(), updatedAt: nowISO() },
    { id: "prod-2", name: "Cotton Thread (White)", sku: "THR-002", barcode: "8901001002", categoryId: "cat-2", unit: "pcs", costPrice: 15, sellingPrice: 25, stockQuantity: 5, minimumStock: 20, isActive: true, createdAt: nowISO(), updatedAt: nowISO() },
    { id: "prod-3", name: "Black Lining Fabric", sku: "FAB-001", barcode: "8901002001", categoryId: "cat-2", unit: "m", costPrice: 90, sellingPrice: 150, stockQuantity: 3, minimumStock: 10, isActive: true, createdAt: nowISO(), updatedAt: nowISO() },
    { id: "prod-4", name: "Designer Kurti Set", sku: "GAR-101", barcode: "8901003001", categoryId: "cat-3", size: "M", color: "Blue", unit: "pcs", costPrice: 450, sellingPrice: 899, stockQuantity: 18, minimumStock: 5, isActive: true, createdAt: nowISO(), updatedAt: nowISO() },
    { id: "prod-5", name: "Pearl Necklace Set", sku: "ORN-01", barcode: "8901004001", categoryId: "cat-1", unit: "set", costPrice: 320, sellingPrice: 750, stockQuantity: 12, minimumStock: 3, isActive: true, createdAt: nowISO(), updatedAt: nowISO() },
    { id: "prod-6", name: "Zipper (Hidden)", sku: "ZIP-01", barcode: "8901005001", categoryId: "cat-2", unit: "pcs", costPrice: 8, sellingPrice: 15, stockQuantity: 8, minimumStock: 25, isActive: true, createdAt: nowISO(), updatedAt: nowISO() },
    { id: "prod-7", name: "Buttons (Mix)", sku: "BTN-01", barcode: "8901006001", categoryId: "cat-2", unit: "pack", costPrice: 20, sellingPrice: 40, stockQuantity: 6, minimumStock: 15, isActive: true, createdAt: nowISO(), updatedAt: nowISO() },
    { id: "prod-8", name: "Ladies Handbag Classic", sku: "BAG-01", barcode: "8901007001", categoryId: "cat-5", color: "Brown", unit: "pcs", costPrice: 280, sellingPrice: 599, stockQuantity: 9, minimumStock: 3, isActive: true, createdAt: nowISO(), updatedAt: nowISO() },
  );
}

const sales: Sale[] = [];
const payments: Payment[] = [];
let lastInvoice: string | null = null;

function touchProduct(p: Product) {
  p.updatedAt = nowISO();
  p.version = (p.version ?? 1) + 1;
  touchPersistence();
}

export function listCategories(): Category[] {
  return categories.filter((c) => !c.deletedAt);
}

export function createCategory(input: { name: string; description?: string | null }): Category {
  assertPermission("products.manage");
  const cat: Category = {
    id: generateId(), name: input.name, description: input.description ?? null,
    isActive: true, createdAt: nowISO(), updatedAt: nowISO(),
  };
  categories.push(cat);
  touchPersistence();
  return cat;
}

function applyProductionEmptyState() {
  if (allowDemoSeed()) return;
  customers.length = 0;
  products.length = 0;
  sales.length = 0;
  payments.length = 0;
}
applyProductionEmptyState();

export function listCustomers(query?: string): Customer[] {
  let list = customers.filter((c) => !c.deletedAt);
  if (query?.trim()) {
    const q = query.toLowerCase();
    list = list.filter((c) => c.name.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q));
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

export function getCustomer(id: UUID): Customer | undefined {
  return customers.find((c) => c.id === id && !c.deletedAt);
}

export function createCustomer(input: {
  name: string; phone?: string | null; whatsapp?: string | null; email?: string | null;
  address?: string | null; notes?: string | null;
}): Customer {
  assertPermission("customers.manage");
  const c: Customer = {
    id: generateId(), name: input.name, phone: input.phone ?? null, whatsapp: input.whatsapp ?? null,
    email: input.email || null, address: input.address ?? null, notes: input.notes ?? null,
    outstandingBalance: 0, totalSpending: 0, createdAt: nowISO(), updatedAt: nowISO(),
  };
  customers.push(c);
  touchPersistence();
  void remoteUpsertCustomer(c);
  return c;
}

export function updateCustomer(id: UUID, patch: Partial<Customer>): Customer | null {
  assertPermission("customers.manage");
  const c = getCustomer(id);
  if (!c) return null;
  Object.assign(c, patch, { updatedAt: nowISO() });
  touchPersistence();
  void remoteUpsertCustomer(c);
  return c;
}

export function listProducts(opts?: { query?: string; categoryId?: string; lowStockOnly?: boolean }): Product[] {
  let list = products.filter((p) => !p.deletedAt);
  if (opts?.categoryId) list = list.filter((p) => p.categoryId === opts.categoryId);
  if (opts?.lowStockOnly) list = list.filter((p) => isLowStock(p.stockQuantity, p.minimumStock));
  if (opts?.query?.trim()) {
    const q = opts.query.toLowerCase();
    list = list.filter((p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.barcode?.includes(q));
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

export function getProduct(id: UUID): Product | undefined {
  return products.find((p) => p.id === id && !p.deletedAt);
}

export function getProductByBarcode(barcode: string): Product | undefined {
  return products.find((p) => p.barcode === barcode && !p.deletedAt && p.isActive);
}

export function createProduct(input: Omit<Product, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version">): Product {
  assertPermission("products.manage");
  const p: Product = {
    parentProductId: (input as Product).parentProductId ?? null,
    hasVariants: (input as Product).hasVariants ?? false,
    fabric: (input as Product).fabric ?? null,
    ...input, id: generateId(), createdAt: nowISO(), updatedAt: nowISO(),
  };
  products.push(p);
  touchPersistence();
  void remoteUpsertProduct(p);
  return p;
}

export function updateProduct(id: UUID, patch: Partial<Product>): Product | null {
  assertPermission("products.manage");
  const p = getProduct(id);
  if (!p) return null;
  Object.assign(p, patch, { updatedAt: nowISO() });
  touchPersistence();
  void remoteUpsertProduct(p);
  return p;
}

export function adjustStock(productId: UUID, type: "stock_in" | "stock_out" | "adjustment", quantity: number, _notes?: string | null): Product | null {
  assertPermission("inventory.adjust");
  const p = getProduct(productId);
  if (!p) return null;
  p.stockQuantity = applyStockMovement(p.stockQuantity, type, quantity);
  touchProduct(p);
  return p;
}

export function listSales(): Sale[] {
  return [...sales].filter((s) => !s.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getSale(id: UUID): Sale | undefined {
  return sales.find((s) => s.id === id && !s.deletedAt);
}

export function createSale(input: {
  customerId?: UUID | null; lines: CartLine[]; paidAmount: number; paymentMethod: PaymentMethod;
  notes?: string | null; allowNegativeStock?: boolean; createdBy?: UUID | null;
}): { sale: Sale; payment: Payment | null; errors: string[] } {
  assertPermission("sales.create");
  const errors = validateCart(input.lines, { allowNegativeStock: input.allowNegativeStock });
  if (!input.allowNegativeStock) {
    for (const line of input.lines) {
      const live = getProduct(line.productId);
      if (!live) errors.push(`Product not found: ${line.productName}`);
      else if (line.quantity > live.stockQuantity) errors.push(`${live.name}: insufficient stock (available ${live.stockQuantity})`);
    }
  }
  if (errors.length) return { sale: null as unknown as Sale, payment: null, errors };

  const totals = calculateCartTotals(input.lines);
  const allocation = allocatePayment(totals.grandTotal, input.paidAmount);
  const invoiceNumber = nextInvoiceNumber(lastInvoice);
  lastInvoice = invoiceNumber;
  const saleId = generateId();
  const items: SaleItem[] = input.lines.map((line) => cartLineToSaleItem(line, saleId, generateId()));
  const customer = input.customerId ? getCustomer(input.customerId) : undefined;
  const sale: Sale = {
    id: saleId, invoiceNumber, customerId: input.customerId ?? null, customerName: customer?.name ?? null,
    saleDate: nowISO(), subtotal: totals.itemsSubtotal, discountAmount: totals.itemsDiscount, taxAmount: totals.itemsTax,
    total: allocation.total, paidAmount: allocation.paidAmount, balanceAmount: allocation.balanceAmount,
    status: allocation.status === "draft" ? "draft" : allocation.status, notes: input.notes ?? null, items,
    createdAt: nowISO(), updatedAt: nowISO(), createdBy: input.createdBy ?? null, version: 1,
  };

  for (const line of input.lines) {
    const p = getProduct(line.productId);
    if (p) {
      p.stockQuantity = applyStockMovement(p.stockQuantity, "sale", line.quantity);
      touchProduct(p);
    }
  }

  if (customer) {
    customer.totalSpending = round2(customer.totalSpending + allocation.paidAmount);
    if (allocation.balanceAmount > 0) customer.outstandingBalance = round2(customer.outstandingBalance + allocation.balanceAmount);
    customer.updatedAt = nowISO();
  }

  sales.push(sale);
  touchPersistence();

  let payment: Payment | null = null;
  if (allocation.paidAmount > 0) {
    payment = {
      id: generateId(), amount: allocation.paidAmount, method: input.paymentMethod,
      referenceType: "sale", referenceId: saleId, customerId: input.customerId ?? null,
      paidAt: nowISO(), createdAt: nowISO(), version: 1,
    };
    payments.push(payment);
    touchPersistence();
  }

  void remoteCreateSale(sale);
  enqueueOutbox("sales", sale.id, "insert", sale);
  if (payment) enqueueOutbox("payments", payment.id, "insert", payment);
  auditAction("sale.create", "sales", sale.id, null, { total: sale.total, invoice: sale.invoiceNumber });
  return { sale, payment, errors: [] };
}

export function listPayments(): Payment[] {
  return [...payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function hydrateCore(data: {
  customers?: Customer[]; products?: Product[]; categories?: Category[]; sales?: Sale[]; payments?: Payment[];
}) {
  if (data.categories) { categories.length = 0; categories.push(...data.categories); }
  if (data.customers) { customers.length = 0; customers.push(...data.customers); }
  if (data.products) { products.length = 0; products.push(...data.products); }
  if (data.sales) { sales.length = 0; sales.push(...data.sales); }
  if (data.payments) { payments.length = 0; payments.push(...data.payments); }
}

export function recordCustomerPayment(input: {
  customerId: UUID; amount: number; method: PaymentMethod; reference?: string | null; notes?: string | null;
}): { payment: Payment | null; customer: Customer | null; errors: string[] } {
  assertPermission("payments.collect");
  const errors: string[] = [];
  if (input.amount <= 0) errors.push("Amount must be positive");
  const customer = getCustomer(input.customerId);
  if (!customer) errors.push("Customer not found");
  if (customer && customer.outstandingBalance <= 0) errors.push("Customer has no outstanding balance");
  if (errors.length || !customer) return { payment: null, customer: null, errors };

  const applied = round2(Math.min(input.amount, customer.outstandingBalance));
  if (applied <= 0) return { payment: null, customer: null, errors: ["No outstanding balance to collect"] };
  customer.outstandingBalance = round2(Math.max(0, customer.outstandingBalance - applied));
  customer.updatedAt = nowISO();

  const payment: Payment = {
    id: generateId(), amount: applied, method: input.method, referenceType: "other", referenceId: customer.id,
    customerId: customer.id, notes: input.notes ?? input.reference ?? null, paidAt: nowISO(), createdAt: nowISO(), version: 1,
  };
  payments.push(payment);
  touchPersistence();
  enqueueOutbox("payments", payment.id, "insert", payment);
  enqueueOutbox("customers", customer.id, "update", customer);
  auditAction("customer.payment", "customers", customer.id, null, { amount: applied, method: input.method });
  return { payment, customer, errors: [] };
}

export function recordRefundPayment(input: {
  returnId: UUID;
  saleId: UUID;
  customerId?: UUID | null;
  amount: number;
  method: PaymentMethod;
  notes?: string | null;
}): Payment | null {
  assertPermission("returns.manage");
  const amount = round2(input.amount);
  if (amount <= 0) return null;
  const payment: Payment = {
    id: generateId(),
    amount,
    method: input.method,
    referenceType: "refund",
    referenceId: input.returnId,
    customerId: input.customerId ?? null,
    notes: input.notes ?? `Refund for sale ${input.saleId}`,
    paidAt: nowISO(),
    createdAt: nowISO(),
    version: 1,
  };
  payments.push(payment);
  touchPersistence();
  enqueueOutbox("payments", payment.id, "insert", payment);
  auditAction("refund.payment", "payments", payment.id, null, {
    returnId: input.returnId,
    saleId: input.saleId,
    amount,
    method: input.method,
  });
  return payment;
}

export function listOutstandingCustomers(): Customer[] {
  return listCustomers().filter((c) => c.outstandingBalance > 0);
}
