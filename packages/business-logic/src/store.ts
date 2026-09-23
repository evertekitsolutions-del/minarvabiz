import { allowDemoSeed } from "./runtime-mode";

import type {
  Customer, Product, Category, Sale, SaleItem, Payment, CartLine, UUID, PaymentMethod, InventoryTransaction,
} from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import {
  calculateCartTotals, cartLineToSaleItem, allocatePayment, validateCart, nextInvoiceNumber, validateTender,
} from "./sales";
import { applyStockMovement, isLowStock } from "./inventory";
import { touchPersistence } from "./autosave";
import { remoteUpsertCustomer, remoteUpsertCategory, remoteUpsertProduct, remoteCreateSale, remoteCreatePayment, remoteCollectCustomerPayment, remoteAdjustStock } from "./remote-write";
import { auditAction } from "./audit-actions";
import { enqueueOutbox } from "./outbox-bridge";
import { assertPermission } from "./permissions";
import { planSalePosting, planCollectionPosting } from "./sales-accounting";
import { planAutomaticPosting } from "./accounting-store";
import { consumeWarehouseStock } from "./warehouse-store";

const categories: Category[] = [];
const customers: Customer[] = [];
const products: Product[] = [];

export interface StockTransferRecord {
  id: UUID;
  referenceNumber: string;
  sourceProductId: UUID;
  destinationProductId: UUID;
  sourceBranchId?: UUID | null;
  destinationBranchId?: UUID | null;
  quantity: number;
  notes?: string | null;
  createdAt: string;
}

const stockTransfers: StockTransferRecord[] = [];

export interface HeldSale {
  id: UUID;
  holdNumber: string;
  customerId?: UUID | null;
  customerName?: string | null;
  lines: CartLine[];
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  branchId?: UUID | null;
}

const heldSales: HeldSale[] = [];

export interface CustomerReceivableItem {
  id: UUID;
  label: string;
  date: string;
  balance: number;
  postedReceivable: boolean;
  sourceType: "service_order" | "laundry";
}

export interface CustomerReceivableProvider {
  list(customerId: UUID): CustomerReceivableItem[];
  validate(allocations: Array<{ item: CustomerReceivableItem; amount: number }>): string | null;
  apply(allocations: Array<{ item: CustomerReceivableItem; amount: number }>, now: string): void;
}

const customerReceivableProviders = new Map<string, CustomerReceivableProvider>();

export function registerCustomerReceivableProvider(key: string, provider: CustomerReceivableProvider | null) {
  if (!provider) customerReceivableProviders.delete(key);
  else customerReceivableProviders.set(key, provider);
}

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
  void remoteUpsertCategory(cat);
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
  address?: string | null; birthday?: string | null; notes?: string | null;
}): Customer {
  assertPermission("customers.manage");
  const c: Customer = {
    id: generateId(), name: input.name, phone: input.phone ?? null, whatsapp: input.whatsapp ?? null,
    email: input.email || null, address: input.address ?? null, birthday: input.birthday ?? null, notes: input.notes ?? null,
    outstandingBalance: 0, totalSpending: 0, createdAt: nowISO(), updatedAt: nowISO(), version: 1,
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
  Object.assign(c, patch, { updatedAt: nowISO(), version: (c.version ?? 1) + 1 });
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

function assertFiniteProductNumerics(input: Partial<Product>): void {
  for (const field of ["costPrice", "sellingPrice", "discount", "taxRate", "stockQuantity", "minimumStock"] as const) {
    const value = input[field];
    if (value != null && !Number.isFinite(value)) {
      throw new Error(`Product ${field} must be a finite number`);
    }
  }
}

export function createProduct(input: Omit<Product, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version">): Product {
  assertPermission("products.manage");
  assertFiniteProductNumerics(input);

  const openingStock = Number(input.stockQuantity ?? 0);
  if (openingStock < 0 || !Number.isSafeInteger(Math.round(openingStock * 1000))) {
    throw new Error("Opening stock quantity must be a finite non-negative quantity");
  }

  const unitCost = Number(input.costPrice ?? 0);
  if (openingStock > 0 && (unitCost < 0 || !Number.isSafeInteger(Math.round(unitCost * 100)))) {
    throw new Error("Product cost must be a finite non-negative amount for opening stock");
  }

  const id = generateId();
  const createdAt = nowISO();
  const openingValue = Math.round((openingStock * unitCost + Number.EPSILON) * 100) / 100;
  if (openingStock > 0 && !Number.isSafeInteger(Math.round(openingValue * 100))) {
    throw new Error("Opening stock value is out of range");
  }

  const posting = openingStock > 0
    ? planAutomaticPosting({
        referenceType: "auto_opening_stock",
        referenceId: "opening-stock-" + id + "-create",
        date: createdAt,
        description: "Opening stock: " + input.name,
        branchId: input.branchId ?? null,
        lines: openingValue > 0 ? [
          { key: "inventory_asset", debit: openingValue },
          { key: "opening_balance_equity", credit: openingValue },
        ] : [],
      })
    : null;
  if (posting?.errors.length) throw new Error(posting.errors.join("; "));

  const p: Product = {
    parentProductId: (input as Product).parentProductId ?? null,
    hasVariants: (input as Product).hasVariants ?? false,
    fabric: (input as Product).fabric ?? null,
    ...input, stockQuantity: openingStock, id, createdAt, updatedAt: createdAt,
  };
  products.push(p);

  const openingJournal = posting?.commit() ?? null;
  if (openingValue > 0 && !openingJournal) {
    products.splice(products.findIndex((product) => product.id === p.id), 1);
    throw new Error("Opening stock accounting posting failed");
  }

  touchPersistence();
  void remoteUpsertProduct(p);
  return p;
}

export function updateProduct(id: UUID, patch: Partial<Product>): Product | null {
  assertPermission("products.manage");
  assertFiniteProductNumerics(patch);
  const p = getProduct(id);
  if (!p) return null;
  if (patch.stockQuantity != null && patch.stockQuantity !== p.stockQuantity) {
    throw new Error("Product stock quantity must be changed through inventory adjustment");
  }
  const before = { ...p };
  Object.assign(p, patch, { updatedAt: nowISO(), version: (p.version ?? 1) + 1 });
  touchPersistence();
  void remoteUpsertProduct(p);
  auditAction("product.update", "products", p.id, before, { ...p });
  return p;
}

export function deleteProduct(id: UUID): Product | null {
  assertPermission("products.manage");
  const p = getProduct(id);
  if (!p) return null;
  const before = { ...p };
  p.deletedAt = nowISO();
  p.isActive = false;
  p.updatedAt = nowISO();
  p.version = (p.version ?? 1) + 1;
  touchPersistence();
  void remoteUpsertProduct(p);
  enqueueOutbox("products", p.id, "delete", p);
  auditAction("product.delete", "products", p.id, before, { deletedAt: p.deletedAt });
  return p;
}

export function adjustStock(productId: UUID, type: "stock_in" | "stock_out" | "adjustment", quantity: number, notes?: string | null): Product | null {
  assertPermission("inventory.adjust");
  if (!Number.isFinite(quantity)) return null;
  const p = getProduct(productId);
  if (!p) return null;
  const before = p.stockQuantity;
  if (type === "stock_out" || (type === "adjustment" && quantity < 0)) {
    consumeWarehouseStock(p.id, type === "stock_out" ? Math.abs(quantity) : Math.abs(quantity), p.branchId ?? null);
  }
  p.stockQuantity = applyStockMovement(p.stockQuantity, type, quantity);
  touchProduct(p);
  void remoteAdjustStock({ ...p }, type, quantity, notes);
  auditAction("inventory.adjust", "products", p.id, { stockQuantity: before }, { stockQuantity: p.stockQuantity, type, quantity, notes: notes ?? null });
  return p;
}


function sameTransferProduct(source: Product, destination: Product): boolean {
  if (source.sku && destination.sku) return source.sku.trim().toLowerCase() === destination.sku.trim().toLowerCase();
  if (source.barcode && destination.barcode) return source.barcode.trim() === destination.barcode.trim();
  return source.name.trim().toLowerCase() === destination.name.trim().toLowerCase();
}

export function listStockTransfers(): StockTransferRecord[] {
  return [...stockTransfers].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function transferStock(input: {
  sourceProductId: UUID;
  destinationProductId: UUID;
  quantity: number;
  notes?: string | null;
}): { transfer: StockTransferRecord | null; errors: string[] } {
  assertPermission("inventory.adjust");
  const source = getProduct(input.sourceProductId);
  const destination = getProduct(input.destinationProductId);
  const quantity = Math.abs(Number(input.quantity));
  const errors: string[] = [];
  if (!source) errors.push("Source product not found");
  if (!destination) errors.push("Destination product not found");
  if (source && destination && source.id === destination.id) errors.push("Source and destination must be different stock records");
  if (source && destination && !sameTransferProduct(source, destination)) errors.push("Source and destination must represent the same SKU/barcode/product");
  if (!Number.isFinite(quantity) || quantity <= 0) errors.push("Transfer quantity must be greater than zero");
  if (source && Number.isFinite(quantity) && source.stockQuantity < quantity) errors.push(`Insufficient source stock (available ${source.stockQuantity})`);
  if (errors.length || !source || !destination) return { transfer: null, errors };

  const transferId = generateId();
  const createdAt = nowISO();
  const transfer: StockTransferRecord = {
    id: transferId,
    referenceNumber: `TRF-${createdAt.slice(0, 10).replace(/-/g, "")}-${transferId.slice(0, 6).toUpperCase()}`,
    sourceProductId: source.id,
    destinationProductId: destination.id,
    sourceBranchId: source.branchId ?? null,
    destinationBranchId: destination.branchId ?? null,
    quantity,
    notes: input.notes ?? null,
    createdAt,
  };

  const sourceBefore = source.stockQuantity;
  const destinationBefore = destination.stockQuantity;
  source.stockQuantity = applyStockMovement(source.stockQuantity, "transfer", quantity);
  destination.stockQuantity = applyStockMovement(destination.stockQuantity, "stock_in", quantity);
  touchProduct(source);
  touchProduct(destination);
  stockTransfers.unshift(transfer);

  const sourceTx: InventoryTransaction = {
    id: generateId(), productId: source.id, type: "transfer", quantity: -quantity,
    unitCost: source.costPrice, referenceType: "stock_transfer", referenceId: transferId,
    notes: input.notes ?? null, createdAt, branchId: source.branchId ?? null, version: 1,
  };
  const destinationTx: InventoryTransaction = {
    id: generateId(), productId: destination.id, type: "transfer", quantity,
    unitCost: destination.costPrice, referenceType: "stock_transfer", referenceId: transferId,
    notes: input.notes ?? null, createdAt, branchId: destination.branchId ?? null, version: 1,
  };

  enqueueOutbox("products", source.id, "update", source);
  enqueueOutbox("products", destination.id, "update", destination);
  enqueueOutbox("inventory_transactions", sourceTx.id, "insert", sourceTx);
  enqueueOutbox("inventory_transactions", destinationTx.id, "insert", destinationTx);
  void remoteUpsertProduct(source);
  void remoteUpsertProduct(destination);
  auditAction("inventory.transfer", "inventory_transactions", transferId,
    { sourceProductId: source.id, destinationProductId: destination.id, sourceStock: sourceBefore, destinationStock: destinationBefore },
    { quantity, sourceStock: source.stockQuantity, destinationStock: destination.stockQuantity, sourceBranchId: source.branchId ?? null, destinationBranchId: destination.branchId ?? null });
  touchPersistence();
  return { transfer, errors: [] };
}

export function listHeldSales(): HeldSale[] {
  return heldSales
    .map((sale) => ({ ...sale, lines: sale.lines.map((line) => ({ ...line })) }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function holdSale(input: {
  customerId?: UUID | null;
  lines: CartLine[];
  notes?: string | null;
}): { heldSale: HeldSale | null; errors: string[] } {
  assertPermission("sales.create");
  const errors = validateCart(input.lines, { allowNegativeStock: false });
  if (!input.lines.length) errors.push("Add at least one item before holding the sale");
  if (errors.length) return { heldSale: null, errors };

  const customer = input.customerId ? getCustomer(input.customerId) : undefined;
  const id = generateId();
  const now = nowISO();
  const heldSale: HeldSale = {
    id,
    holdNumber: `HOLD-${now.slice(11, 19).replace(/:/g, "")}-${id.slice(0, 5).toUpperCase()}`,
    customerId: input.customerId ?? null,
    customerName: customer?.name ?? null,
    lines: input.lines.map((line) => ({ ...line })),
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  };
  heldSales.unshift(heldSale);
  touchPersistence();
  auditAction("sale.hold", "held_sales", heldSale.id, null, {
    holdNumber: heldSale.holdNumber,
    customerId: heldSale.customerId,
    lineCount: heldSale.lines.length,
  });
  return { heldSale: { ...heldSale, lines: heldSale.lines.map((line) => ({ ...line })) }, errors: [] };
}

export function removeHeldSale(id: UUID): HeldSale | null {
  assertPermission("sales.create");
  const index = heldSales.findIndex((sale) => sale.id === id);
  if (index < 0) return null;
  const [removed] = heldSales.splice(index, 1);
  touchPersistence();
  auditAction("sale.resume", "held_sales", removed.id, { holdNumber: removed.holdNumber }, null);
  return { ...removed, lines: removed.lines.map((line) => ({ ...line })) };
}

export function listSales(): Sale[] {
  return [...sales].filter((s) => !s.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getSale(id: UUID): Sale | undefined {
  return sales.find((s) => s.id === id && !s.deletedAt);
}

export function createSale(input: {
  customerId?: UUID | null; lines: CartLine[]; paidAmount: number; paymentMethod: PaymentMethod;
  paymentSplits?: Array<{ method: PaymentMethod; amount: number; reference?: string | null }>;
  notes?: string | null; allowNegativeStock?: boolean; createdBy?: UUID | null;
  /** Internal non-cash settlement such as exchange credit. No Payment row is emitted for this amount. */
  creditAmount?: number;
}): { sale: Sale; payment: Payment | null; payments: Payment[]; errors: string[] } {
  assertPermission("sales.create");
  const errors = validateCart(input.lines, { allowNegativeStock: input.allowNegativeStock });
  if (!input.allowNegativeStock) {
    for (const line of input.lines) {
      const live = getProduct(line.productId);
      if (!live) errors.push(`Product not found: ${line.productName}`);
      else if (line.quantity > live.stockQuantity) errors.push(`${live.name}: insufficient stock (available ${live.stockQuantity})`);
    }
  }
  if (errors.length) return { sale: null as unknown as Sale, payment: null, payments: [], errors };

  const totals = calculateCartTotals(input.lines);
  const requestedCredit = round2(Math.max(0, input.creditAmount ?? 0));
  const creditApplied = round2(Math.min(requestedCredit, totals.grandTotal));
  const remainingAfterCredit = round2(Math.max(0, totals.grandTotal - creditApplied));
  const requestedSplits = (input.paymentSplits?.length
    ? input.paymentSplits
    : [{ method: input.paymentMethod, amount: input.paidAmount }])
    .map((split) => ({
      method: split.method,
      amount: round2(Number(split.amount) || 0),
      reference: split.reference ?? null,
    }))
    .filter((split) => split.amount !== 0);
  const tender = validateTender(remainingAfterCredit, requestedSplits);
  if (tender.errors.length) {
    return { sale: null as unknown as Sale, payment: null, payments: [], errors: tender.errors };
  }
  const actualPayment = tender.collectible;
  const allocation = allocatePayment(totals.grandTotal, creditApplied + actualPayment);
  const invoiceNumber = nextInvoiceNumber(lastInvoice);
  lastInvoice = invoiceNumber;
  const saleId = generateId();
  const items: SaleItem[] = input.lines.map((line) => cartLineToSaleItem(line, saleId, generateId()));
  const customer = input.customerId ? getCustomer(input.customerId) : undefined;
  const sale: Sale = {
    id: saleId, invoiceNumber, customerId: input.customerId ?? null, customerName: customer?.name ?? null,
    saleDate: nowISO(), subtotal: totals.itemsSubtotal, discountAmount: totals.itemsDiscount, taxAmount: totals.itemsTax,
    total: allocation.total, paidAmount: allocation.paidAmount, balanceAmount: allocation.balanceAmount,
    status: allocation.status === "draft" ? "draft" : allocation.status,
    notes: [input.notes, creditApplied > 0 ? `Exchange/store credit applied: ${creditApplied.toFixed(2)}` : null].filter(Boolean).join(" · ") || null,
    items,
    createdAt: nowISO(), updatedAt: nowISO(), createdBy: input.createdBy ?? null, version: 1,
  };

  const accountingPlan = planSalePosting(sale, requestedSplits, creditApplied);
  if (accountingPlan.errors.length) return { sale: null as unknown as Sale, payment: null, payments: [], errors: accountingPlan.errors };

  for (const line of input.lines) {
    const p = getProduct(line.productId);
    if (p) {
      consumeWarehouseStock(p.id, line.quantity, p.branchId ?? null);
      p.stockQuantity = applyStockMovement(p.stockQuantity, "sale", line.quantity);
      touchProduct(p);
    }
  }

  if (customer) {
    customer.totalSpending = round2(customer.totalSpending + allocation.paidAmount);
    if (allocation.balanceAmount > 0) customer.outstandingBalance = round2(customer.outstandingBalance + allocation.balanceAmount);
    customer.updatedAt = nowISO();
    customer.version = (customer.version ?? 1) + 1;
  }

  sales.push(sale);
  touchPersistence();

  const salePayments: Payment[] = [];
  let paymentRemaining = actualPayment;
  for (const split of requestedSplits) {
    if (paymentRemaining <= 0) break;
    const amount = round2(Math.min(split.amount, paymentRemaining));
    if (amount <= 0) continue;
    const payment: Payment = {
      id: generateId(), amount, method: split.method,
      referenceType: "sale", referenceId: saleId, customerId: input.customerId ?? null,
      notes: split.reference || null,
      paidAt: nowISO(), createdAt: nowISO(), version: 1,
    };
    payments.push(payment);
    salePayments.push(payment);
    paymentRemaining = round2(paymentRemaining - amount);
  }
  if (salePayments.length) touchPersistence();

  accountingPlan.commit();
  void remoteCreateSale(sale, salePayments, Boolean(input.allowNegativeStock));
  auditAction("sale.create", "sales", sale.id, null, {
    total: sale.total,
    invoice: sale.invoiceNumber,
    actualPayment,
    creditApplied,
    paymentSplits: salePayments.map((p) => ({ method: p.method, amount: p.amount })),
    tendered: tender.tendered,
    changeDue: tender.changeDue,
  });
  return { sale, payment: salePayments[0] ?? null, payments: salePayments, errors: [] };
}

export function listPayments(): Payment[] {
  return [...payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function recordOrderAdvancePaymentEntry(input: {
  orderId: UUID;
  customerId: UUID;
  amount: number;
  method: PaymentMethod;
  paidAt?: string;
}): Payment {
  assertPermission("orders.manage");
  if (!Number.isFinite(input.amount) || round2(input.amount) <= 0 || !Number.isSafeInteger(Math.round(input.amount * 100))) {
    throw new Error("Service order advance must be positive and finite");
  }
  if (!["cash", "bank", "card", "upi", "online", "other"].includes(input.method)) {
    throw new Error("Invalid service order advance payment method");
  }
  const now = input.paidAt ?? nowISO();
  const payment: Payment = {
    id: generateId(),
    amount: round2(input.amount),
    method: input.method,
    referenceType: "order",
    referenceId: input.orderId,
    customerId: input.customerId,
    notes: "Service order advance",
    paidAt: now,
    createdAt: nowISO(),
    version: 1,
  };
  payments.push(payment);
  touchPersistence();
  void remoteCreatePayment(payment);
  auditAction("service_order.advance_payment", "payments", payment.id, null, {
    orderId: input.orderId,
    customerId: input.customerId,
    amount: payment.amount,
    method: payment.method,
  });
  return payment;
}

export function recordLaundryPaymentEntry(input: {
  laundryOrderId: UUID;
  customerId: UUID;
  amount: number;
  method: PaymentMethod;
  paidAt?: string;
  orderNumber?: string | null;
}): Payment {
  assertPermission("orders.manage");
  if (!Number.isFinite(input.amount) || round2(input.amount) <= 0 || !Number.isSafeInteger(Math.round(input.amount * 100))) {
    throw new Error("Laundry receipt must be positive and finite");
  }
  if (!["cash", "bank", "card", "upi", "online", "other"].includes(input.method)) {
    throw new Error("Invalid laundry payment method");
  }
  const now = input.paidAt ?? nowISO();
  const payment: Payment = {
    id: generateId(),
    amount: round2(input.amount),
    method: input.method,
    referenceType: "laundry",
    referenceId: input.laundryOrderId,
    customerId: input.customerId,
    notes: input.orderNumber ? "Laundry receipt: " + input.orderNumber : "Laundry receipt",
    paidAt: now,
    createdAt: nowISO(),
    version: 1,
  };
  payments.push(payment);
  touchPersistence();
  void remoteCreatePayment(payment);
  auditAction("laundry.receipt_payment", "payments", payment.id, null, {
    laundryOrderId: input.laundryOrderId,
    customerId: input.customerId,
    amount: payment.amount,
    method: payment.method,
  });
  return payment;
}

export function recordLaundryRefundPaymentEntry(input: {
  laundryOrderId: UUID;
  customerId: UUID;
  amount: number;
  method: PaymentMethod;
  refundedAt?: string;
  orderNumber?: string | null;
}): Payment {
  assertPermission("orders.manage");
  if (!Number.isFinite(input.amount) || round2(input.amount) <= 0 || !Number.isSafeInteger(Math.round(input.amount * 100))) {
    throw new Error("Laundry refund must be positive and finite");
  }
  if (!["cash", "bank", "card", "upi", "online", "other"].includes(input.method)) {
    throw new Error("Invalid laundry refund payment method");
  }
  const now = input.refundedAt ?? nowISO();
  const payment: Payment = {
    id: generateId(),
    amount: round2(input.amount),
    method: input.method,
    referenceType: "refund",
    referenceId: input.laundryOrderId,
    customerId: input.customerId,
    notes: input.orderNumber ? "Laundry cancellation refund: " + input.orderNumber : "Laundry cancellation refund",
    paidAt: now,
    createdAt: nowISO(),
    version: 1,
  };
  payments.push(payment);
  touchPersistence();
  void remoteCreatePayment(payment);
  auditAction("laundry.refund_payment", "payments", payment.id, null, {
    laundryOrderId: input.laundryOrderId,
    customerId: input.customerId,
    amount: payment.amount,
    method: payment.method,
  });
  return payment;
}

export function recordOrderRefundPaymentEntry(input: {
  orderId: UUID;
  customerId: UUID;
  amount: number;
  method: PaymentMethod;
  refundedAt?: string;
}): Payment {
  assertPermission("orders.manage");
  if (!Number.isFinite(input.amount) || round2(input.amount) <= 0 || !Number.isSafeInteger(Math.round(input.amount * 100))) {
    throw new Error("Service order refund must be positive and finite");
  }
  if (!["cash", "bank", "card", "upi", "online", "other"].includes(input.method)) {
    throw new Error("Invalid service order refund payment method");
  }
  const now = input.refundedAt ?? nowISO();
  const payment: Payment = {
    id: generateId(),
    amount: round2(input.amount),
    method: input.method,
    referenceType: "refund",
    referenceId: input.orderId,
    customerId: input.customerId,
    notes: "Service order cancellation refund",
    paidAt: now,
    createdAt: nowISO(),
    version: 1,
  };
  payments.push(payment);
  touchPersistence();
  void remoteCreatePayment(payment);
  auditAction("service_order.refund_payment", "payments", payment.id, null, {
    orderId: input.orderId,
    customerId: input.customerId,
    amount: payment.amount,
    method: payment.method,
  });
  return payment;
}

export function recordSupplierPaymentEntry(input: {
  supplierId: UUID;
  amount: number;
  method: PaymentMethod;
  paidAt?: string;
  reference?: string | null;
  notes?: string | null;
  /** Internal settlement coordinator queues the full document/payment group. */
  deferRemote?: boolean;
  paymentId?: UUID;
}): Payment {
  assertPermission("purchases.manage");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Amount must be positive");
  const paidAt = input.paidAt
    ? (input.paidAt.length === 10 ? `${input.paidAt}T00:00:00.000Z` : input.paidAt)
    : nowISO();
  const payment: Payment = {
    id: input.paymentId ?? generateId(),
    amount: round2(input.amount),
    method: input.method,
    referenceType: "supplier",
    referenceId: input.supplierId,
    customerId: null,
    notes: [input.reference, input.notes].filter(Boolean).join(" · ") || null,
    paidAt,
    createdAt: nowISO(),
    version: 1,
  };
  payments.push(payment);
  touchPersistence();
  if (!input.deferRemote) void remoteCreatePayment(payment);
  auditAction("supplier.payment", "payments", payment.id, null, {
    supplierId: input.supplierId,
    amount: payment.amount,
    method: payment.method,
  });
  return payment;
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function hydrateCore(data: {
  customers?: Customer[]; products?: Product[]; categories?: Category[]; sales?: Sale[]; payments?: Payment[]; stockTransfers?: StockTransferRecord[]; heldSales?: HeldSale[];
}) {
  if (data.categories) { categories.length = 0; categories.push(...data.categories); }
  if (data.customers) { customers.length = 0; customers.push(...data.customers); }
  if (data.products) { products.length = 0; products.push(...data.products); }
  if (data.sales) { sales.length = 0; sales.push(...data.sales); }
  if (data.payments) { payments.length = 0; payments.push(...data.payments); }
  if (data.stockTransfers) { stockTransfers.length = 0; stockTransfers.push(...data.stockTransfers); }
  if (data.heldSales) {
    heldSales.length = 0;
    heldSales.push(...data.heldSales.map((sale) => ({ ...sale, lines: sale.lines.map((line) => ({ ...line })) })));
  }
}

export function recordCustomerPayment(input: {
  customerId: UUID; amount: number; method: PaymentMethod; reference?: string | null; notes?: string | null;
}): { payment: Payment | null; customer: Customer | null; errors: string[] } {
  assertPermission("payments.collect");
  const errors: string[] = [];
  if (!Number.isFinite(input.amount) || round2(input.amount) <= 0 || !Number.isSafeInteger(Math.round(input.amount * 100))) errors.push("Amount must be positive and finite");
  if (!["cash", "bank", "card", "upi", "online", "other"].includes(input.method)) errors.push("Invalid payment method");
  const customer = getCustomer(input.customerId);
  if (!customer || customer.deletedAt) errors.push("Customer not found");
  if (customer && (!Number.isFinite(customer.outstandingBalance) || customer.outstandingBalance <= 0)) errors.push("Customer has no valid outstanding balance");
  if (errors.length || !customer) return { payment: null, customer: null, errors };

  const applied = round2(Math.min(input.amount, customer.outstandingBalance));
  if (applied <= 0) return { payment: null, customer: null, errors: ["No outstanding balance to collect"] };

  const saleCandidates = sales.filter((sale) => sale.customerId === customer.id && !sale.deletedAt
    && sale.status !== "cancelled" && sale.status !== "returned" && sale.balanceAmount > 0)
    .map((sale) => ({ kind: "sale" as const, id: sale.id, date: sale.saleDate, sale, balance: sale.balanceAmount }));
  const externalCandidates = [...customerReceivableProviders.entries()].flatMap(([providerKey, provider]) =>
    provider.list(customer.id).map((item) => ({
      kind: "external" as const, id: item.id, date: item.date, item, balance: item.balance, providerKey,
    }))
  );
  const candidates = [...saleCandidates, ...externalCandidates]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  let remaining = applied;
  const allocations: Array<{ sale: Sale; amount: number }> = [];
  const externalAllocations: Array<{ item: CustomerReceivableItem; amount: number; providerKey: string }> = [];
  for (const candidate of candidates) {
    if (remaining <= 0) break;
    if (!Number.isFinite(candidate.balance) || candidate.balance <= 0 || !Number.isSafeInteger(Math.round(candidate.balance * 100))) {
      return { payment: null, customer: null, errors: ["Customer receivable balances need reconciliation: " + candidate.id] };
    }
    if (candidate.kind === "sale") {
      const sale = candidate.sale;
      if (![sale.total, sale.paidAmount, sale.balanceAmount].every(Number.isFinite) || sale.paidAmount < 0
        || round2(sale.paidAmount + sale.balanceAmount) !== round2(sale.total)) {
        return { payment: null, customer: null, errors: ["Invoice balances need reconciliation: " + sale.invoiceNumber] };
      }
      const amount = round2(Math.min(remaining, sale.balanceAmount));
      allocations.push({ sale, amount });
      remaining = round2(remaining - amount);
    } else {
      const amount = round2(Math.min(remaining, candidate.item.balance));
      externalAllocations.push({ item: candidate.item, amount, providerKey: candidate.providerKey });
      remaining = round2(remaining - amount);
    }
  }

  const now = nowISO();
  const invoiceNote = allocations.length ? "Invoices: " + allocations.map(({ sale, amount }) => sale.invoiceNumber + " " + amount.toFixed(2)).join(", ") : null;
  const serviceAllocations = externalAllocations.filter(({ item }) => item.sourceType === "service_order");
  const laundryAllocations = externalAllocations.filter(({ item }) => item.sourceType === "laundry");
  const serviceNote = serviceAllocations.length ? "Service orders: " + serviceAllocations.map(({ item, amount }) => item.label + " " + amount.toFixed(2)).join(", ") : null;
  const laundryNote = laundryAllocations.length ? "Laundry: " + laundryAllocations.map(({ item, amount }) => item.label + " " + amount.toFixed(2)).join(", ") : null;
  for (const [providerKey, provider] of customerReceivableProviders) {
    const providerAllocations = externalAllocations
      .filter((allocation) => allocation.providerKey === providerKey)
      .map(({ item, amount }) => ({ item, amount }));
    if (!providerAllocations.length) continue;
    const validationError = provider.validate(providerAllocations);
    if (validationError) return { payment: null, customer: null, errors: [validationError] };
  }

  const payment: Payment = {
    id: generateId(), amount: applied, method: input.method, referenceType: "other", referenceId: customer.id,
    customerId: customer.id, notes: [input.notes, input.reference, invoiceNote, serviceNote, laundryNote, remaining > 0 ? "Other customer balance: " + remaining.toFixed(2) : null].filter(Boolean).join(" · ") || null,
    paidAt: now, createdAt: now, version: 1,
  };
  const additionalPostedReceivable = round2(externalAllocations
    .filter(({ item }) => item.postedReceivable)
    .reduce((sum, { amount }) => sum + amount, 0));
  const accountingPlan = planCollectionPosting(payment, allocations, additionalPostedReceivable);
  if (accountingPlan.errors.length) return { payment: null, customer: null, errors: accountingPlan.errors };

  customer.outstandingBalance = round2(Math.max(0, customer.outstandingBalance - applied));
  customer.totalSpending = round2(customer.totalSpending + applied);
  customer.updatedAt = now;
  customer.version = (customer.version ?? 1) + 1;
  for (const { sale, amount } of allocations) {
    sale.paidAmount = round2(sale.paidAmount + amount);
    sale.balanceAmount = round2(Math.max(0, sale.balanceAmount - amount));
    sale.status = sale.balanceAmount === 0 ? "completed" : "partial";
    sale.updatedAt = now;
    sale.version = (sale.version || 1) + 1;
  }
  if (externalAllocations.length) {
    for (const [providerKey, provider] of customerReceivableProviders) {
      const providerAllocations = externalAllocations
        .filter((allocation) => allocation.providerKey === providerKey)
        .map(({ item, amount }) => ({ item, amount }));
      if (providerAllocations.length) provider.apply(providerAllocations, now);
    }
  }
  accountingPlan.commit();
  payments.push(payment);
  void remoteCollectCustomerPayment({ ...payment }, { ...customer }, allocations.map(({ sale }) => ({ ...sale, items: sale.items.map((item) => ({ ...item })) })));
  touchPersistence();
  auditAction("customer.payment", "customers", customer.id, null, {
    paymentId: payment.id, amount: applied, method: input.method,
    allocations: allocations.map(({ sale, amount }) => ({ type: "sale", saleId: sale.id, invoiceNumber: sale.invoiceNumber, amount })),
    serviceOrderAllocations: serviceAllocations.map(({ item, amount }) => ({ type: "service_order", orderId: item.id, orderNumber: item.label, amount })),
    laundryAllocations: laundryAllocations.map(({ item, amount }) => ({ type: "laundry", laundryOrderId: item.id, orderNumber: item.label, amount })),
    otherBalanceAmount: remaining,
  });
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
