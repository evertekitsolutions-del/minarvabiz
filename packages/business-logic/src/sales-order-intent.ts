/**
 * SAL-003 phase 1: deterministic retail sales-order intent planner.
 *
 * Feature OFF by default. This module never posts payments, debits stock,
 * creates invoices, or enqueues cloud writes. Callers must supply host-verified
 * scope and roles, and eventually commit plans through an atomic repository.
 *
 * Original Minarva code. Open Mercato sales is a behavioural reference only.
 */

import { nextBusinessDocumentNumber } from "./document-numbering";

export interface SalesOrderScope {
  readonly organizationId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly warehouseId: string;
}

export interface SalesOrderLineInput {
  readonly id: string;
  readonly productId: string;
  readonly description: string;
  /** Exact quantity in 1/1000 of a unit. */
  readonly quantityMilli: number;
  /** Exact smallest currency unit: cents, paise, etc. */
  readonly unitPriceMinor: number;
  readonly discountMinor: number;
  readonly taxMinor: number;
}

export interface SalesOrderLine extends SalesOrderLineInput {
  readonly subtotalMinor: number;
  readonly totalMinor: number;
}

export type SalesOrderStatus = "draft" | "confirmed" | "cancelled" | "invoiced";

export interface SalesOrderIntent extends SalesOrderScope {
  readonly id: string;
  readonly operationId: string;
  readonly orderNumber: string;
  readonly customerId: string;
  readonly currency: string;
  readonly status: SalesOrderStatus;
  readonly lines: readonly SalesOrderLine[];
  readonly subtotalMinor: number;
  readonly discountMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly note: string | null;
  readonly dueDate: string | null;
  readonly invoiceId: string | null;
  readonly version: number;
  readonly lastOperationId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export interface SalesOrderAuthorizedScope extends SalesOrderScope {
  /** From trusted membership/RBAC context, never from renderer JSON. */
  readonly canManageSalesOrders: boolean;
}
export interface SalesOrderCreateRequest extends SalesOrderScope {
  readonly id: string;
  readonly operationId: string;
  readonly orderNumber: string;
  readonly customerId: string;
  readonly currency: string;
  readonly lines: readonly SalesOrderLineInput[];
  readonly note?: string | null;
  readonly dueDate?: string | null;
  readonly createdAt: string;
}

/** Draft-only, version-checked edit. Customer and inventory scope are immutable. */
export interface SalesOrderDraftAmendRequest {
  readonly operationId: string;
  readonly expectedVersion: number;
  readonly occurredAt: string;
  readonly lines: readonly SalesOrderLineInput[];
  readonly note?: string | null;
  readonly dueDate?: string | null;
}

export interface SalesOrderTransitionRequest {
  readonly operationId: string;
  readonly expectedVersion: number;
  readonly action: "confirm" | "cancel" | "link-invoice";
  readonly occurredAt: string;
  /** Only supplied by the authoritative, already-committed sale writer. */
  readonly committedInvoice?: {
    readonly id: string;
    readonly organizationId: string;
    readonly companyId: string;
    readonly branchId: string;
    readonly customerId: string;
    readonly currency: string;
    readonly totalMinor: number;
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function uuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`Invalid ${field} UUID`);
  return value.toLowerCase();
}
function minor(value: unknown, field: string): bigint {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a nonnegative safe integer in minor currency units`);
  }
  return BigInt(value);
}
function safe(value: bigint, field: string): number {
  if (value < 0n || value > MAX) throw new Error(`${field} exceeds safe minor-unit range`);
  return Number(value);
}
function iso(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error(`Invalid ${field} timestamp`);
  }
  return value;
}
function date(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !DATE.test(value) ||
    !Number.isFinite(Date.parse(value + "T00:00:00.000Z")) ||
    new Date(value + "T00:00:00.000Z").toISOString().slice(0, 10) !== value) {
    throw new Error("Invalid due date");
  }
  return value;
}
function scope(input: SalesOrderScope, auth: SalesOrderAuthorizedScope): SalesOrderScope {
  if (!auth?.canManageSalesOrders) throw new Error("Sales-order permission denied");
  const fields = ["organizationId", "companyId", "branchId", "warehouseId"] as const;
  const trusted = {} as Record<(typeof fields)[number], string>;
  for (const key of fields) {
    trusted[key] = uuid(auth[key], `authorized ${key}`);
    if (uuid(input[key], key) !== trusted[key]) throw new Error(`Sales order ${key} scope mismatch`);
  }
  return trusted;
}
function gate(enabled: boolean): void {
  if (enabled !== true) throw new Error("SAL-003 feature is disabled");
}
function textField(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength || value.trim() !== value) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}
function nullableNote(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 2000) throw new Error("Invalid note");
  return value.trim() || null;
}
function normalizeLines(lines: readonly SalesOrderLineInput[]): {
  lines: SalesOrderLine[]; subtotalMinor: number; discountMinor: number;
  taxMinor: number; totalMinor: number;
} {
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 100) {
    throw new Error("Sales order requires 1 to 100 lines");
  }
  const seen = new Set<string>();
  let subtotal = 0n, discount = 0n, tax = 0n;
  const normalized = lines.map((line) => {
    if (!line || typeof line !== "object") throw new Error("Invalid sales-order line");
    const id = uuid(line.id, "line");
    if (seen.has(id)) throw new Error("Duplicate sales-order line ID");
    seen.add(id);
    const productId = uuid(line.productId, "product");
    const description = textField(line.description, "line description", 300);
    const qty = minor(line.quantityMilli, "quantityMilli");
    if (qty <= 0n) throw new Error("Sales-order quantity must be positive");
    const unit = minor(line.unitPriceMinor, "unitPriceMinor");
    const raw = qty * unit;
    if (raw % 1000n !== 0n) throw new Error("Sales-order line has fractional minor currency units");
    const lineSubtotal = raw / 1000n;
    const off = minor(line.discountMinor, "discountMinor");
    const lineTax = minor(line.taxMinor, "taxMinor");
    if (off > lineSubtotal) throw new Error("Sales-order discount exceeds line subtotal");
    const lineTotal = lineSubtotal - off + lineTax;
    subtotal += lineSubtotal; discount += off; tax += lineTax;
    return {
      id, productId, description,
      quantityMilli: safe(qty, "quantityMilli"),
      unitPriceMinor: safe(unit, "unitPriceMinor"),
      discountMinor: safe(off, "discountMinor"),
      taxMinor: safe(lineTax, "taxMinor"),
      subtotalMinor: safe(lineSubtotal, "line subtotal"),
      totalMinor: safe(lineTotal, "line total"),
    };
  });
  return {
    lines: normalized, subtotalMinor: safe(subtotal, "order subtotal"),
    discountMinor: safe(discount, "order discount"),
    taxMinor: safe(tax, "order tax"),
    totalMinor: safe(subtotal - discount + tax, "order total"),
  };
}

function equivalent(a: SalesOrderIntent, b: SalesOrderIntent): boolean {
  return a.id === b.id && a.operationId === b.operationId &&
    a.organizationId === b.organizationId && a.companyId === b.companyId &&
    a.branchId === b.branchId && a.warehouseId === b.warehouseId &&
    a.orderNumber === b.orderNumber && a.customerId === b.customerId &&
    a.currency === b.currency && a.note === b.note && a.dueDate === b.dueDate &&
    a.createdAt === b.createdAt && JSON.stringify(a.lines) === JSON.stringify(b.lines);
}

/** Deterministic, side-effect-free create/retry plan. Atomic persistence is a later slice. */
export function planSalesOrderCreate(
  request: SalesOrderCreateRequest,
  auth: SalesOrderAuthorizedScope,
  existingOrders: readonly SalesOrderIntent[] = [],
  enabled = false,
): { disposition: "new" | "replay"; order: SalesOrderIntent } {
  gate(enabled);
  const verified = scope(request, auth);
  const id = uuid(request.id, "sales order");
  const operationId = uuid(request.operationId, "operation");
  const customerId = uuid(request.customerId, "customer");
  const orderNumber = textField(request.orderNumber, "order number", 48);
  if (!/^[A-Za-z0-9/_-]+$/.test(orderNumber)) throw new Error("Invalid order number characters");
  const currency = textField(request.currency, "currency", 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid ISO currency");
  const createdAt = iso(request.createdAt, "creation");
  const totals = normalizeLines(request.lines);
  const order: SalesOrderIntent = {
    ...verified, id, operationId, customerId, orderNumber, currency,
    ...totals, note: nullableNote(request.note), dueDate: date(request.dueDate),
    status: "draft", invoiceId: null, version: 1, lastOperationId: operationId,
    createdAt, updatedAt: createdAt, deletedAt: null,
  };
  for (const item of existingOrders) {
    if (!item) throw new Error("Invalid existing sales order");
    if (item.organizationId === order.organizationId && item.operationId === operationId) {
      if (!equivalent(item, order)) throw new Error("Sales-order idempotency-key payload conflict");
      return { disposition: "replay", order: item };
    }
    if (item.id === id) throw new Error("Sales-order ID collision");
    if (item.organizationId === order.organizationId && item.companyId === order.companyId &&
      item.orderNumber === orderNumber && !item.deletedAt) {
      throw new Error("Sales-order number already exists");
    }
  }
  return { disposition: "new", order };
}

/** Pure CAS planner: never updates an invoice, stock, payment or outbox itself. */
export function planSalesOrderTransition(
  order: SalesOrderIntent,
  request: SalesOrderTransitionRequest,
  auth: SalesOrderAuthorizedScope,
  enabled = false,
): { disposition: "update" | "replay"; order: SalesOrderIntent } {
  gate(enabled);
  scope(order, auth);
  if (order.deletedAt) throw new Error("Archived sales order cannot transition");
  const operationId = uuid(request.operationId, "operation");
  const occurredAt = iso(request.occurredAt, "transition");
  if (order.lastOperationId === operationId) {
    const same = (request.action === "confirm" && order.status === "confirmed") ||
      (request.action === "cancel" && order.status === "cancelled") ||
      (request.action === "link-invoice" && order.status === "invoiced" &&
        order.invoiceId === request.committedInvoice?.id?.toLowerCase());
    if (same) return { disposition: "replay", order };
    throw new Error("Operation key reused for a different transition");
  }
  if (!Number.isSafeInteger(request.expectedVersion) || request.expectedVersion !== order.version) {
    throw new Error("Stale sales-order version");
  }
  if (occurredAt < order.updatedAt) throw new Error("Sales-order transition timestamp moved backwards");
  let status: SalesOrderStatus;
  let invoiceId: string | null = order.invoiceId;
  switch (request.action) {
    case "confirm":
      if (order.status !== "draft") throw new Error("Only draft sales orders may be confirmed");
      status = "confirmed";
      break;
    case "cancel":
      if (order.status !== "draft" && order.status !== "confirmed") {
        throw new Error("Invoiced or cancelled sales orders cannot be cancelled");
      }
      status = "cancelled";
      break;
    case "link-invoice": {
      if (order.status !== "confirmed") throw new Error("Sales order must be confirmed before invoicing");
      const sale = request.committedInvoice;
      if (!sale || uuid(sale.id, "committed invoice") === order.id ||
        uuid(sale.organizationId, "invoice organization") !== order.organizationId ||
        uuid(sale.companyId, "invoice company") !== order.companyId ||
        uuid(sale.branchId, "invoice branch") !== order.branchId ||
        uuid(sale.customerId, "invoice customer") !== order.customerId ||
        sale.currency !== order.currency || minor(sale.totalMinor, "invoice total") !== BigInt(order.totalMinor)) {
        throw new Error("Verified invoice does not match sales-order identity, branch or total");
      }
      invoiceId = uuid(sale.id, "committed invoice");
      status = "invoiced";
      break;
    }
    default:
      throw new Error("Unknown sales-order transition");
  }
  if (order.version >= Number.MAX_SAFE_INTEGER) throw new Error("Sales-order version exhausted");
  return { disposition: "update", order: {
    ...order, status, invoiceId, version: order.version + 1,
    updatedAt: occurredAt, lastOperationId: operationId,
  } };
}

/**
 * Recalculate an existing draft from a replacement line set (never a delta).
 * Pure and scoped; the trusted SQLite/cloud adapter must commit the CAS.
 */
export function planSalesOrderDraftAmend(
  order: SalesOrderIntent,
  request: SalesOrderDraftAmendRequest,
  auth: SalesOrderAuthorizedScope,
  enabled = false,
): { disposition: "update" | "replay"; order: SalesOrderIntent } {
  gate(enabled);
  scope(order, auth);
  if (order.deletedAt || order.status !== "draft") {
    throw new Error("Only an active draft sales order can be edited");
  }
  const operationId = uuid(request.operationId, "operation");
  const occurredAt = iso(request.occurredAt, "amendment");
  const totals = normalizeLines(request.lines);
  const note = nullableNote(request.note);
  const dueDate = date(request.dueDate);
  if (operationId === order.lastOperationId) {
    if (order.updatedAt === occurredAt && order.note === note &&
      order.dueDate === dueDate && JSON.stringify(order.lines) === JSON.stringify(totals.lines) &&
      order.subtotalMinor === totals.subtotalMinor && order.discountMinor === totals.discountMinor &&
      order.taxMinor === totals.taxMinor && order.totalMinor === totals.totalMinor) {
      return { disposition: "replay", order };
    }
    throw new Error("Sales-order amendment idempotency-key payload conflict");
  }
  if (!Number.isSafeInteger(request.expectedVersion) ||
    request.expectedVersion !== order.version) {
    throw new Error("Stale sales-order version");
  }
  if (occurredAt < order.updatedAt) {
    throw new Error("Sales-order amendment timestamp moved backwards");
  }
  if (order.version >= Number.MAX_SAFE_INTEGER) throw new Error("Sales-order version exhausted");
  return { disposition: "update", order: {
    ...order, ...totals, note, dueDate,
    version: order.version + 1, updatedAt: occurredAt, lastOperationId: operationId,
  } };
}

/**
 * SAL-003 numbering suggestion, not a reservation. A cloud/SQLite writer MUST
 * allocate and enforce (organization, company, orderNumber) atomically.
 *
 * Only accepts a trusted/scope-filtered current-order list; any cross-scope
 * input is rejected instead of silently leaking competitor/tenant numbering.
 */
export function suggestSalesOrderNumber(
  existing: readonly SalesOrderIntent[],
  auth: SalesOrderAuthorizedScope,
  businessCode: string,
  at: Date,
  enabled = false,
): string {
  gate(enabled);
  if (!auth?.canManageSalesOrders) throw new Error("Sales-order permission denied");
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) {
    throw new Error("Invalid sales-order numbering date");
  }
  const trusted = scope(auth, auth);
  if (!Array.isArray(existing)) throw new Error("Invalid sales-order number source");
  const numbers: string[] = [];
  for (const order of existing) {
    scope(order, auth);
    // Existing orders with a legal tombstone retain their number forever.
    // Never reissue a document number used before archival.
    numbers.push(order.orderNumber);
  }
  const prefix = businessCode.trim();
  if (!prefix || prefix.length > 8 || !/^[A-Za-z0-9]+$/.test(prefix)) {
    throw new Error("Invalid sales-order company document code");
  }
  // Deliberately no company or branch mutation; the DB uniqueness constraint
  // decides authoritative allocation when simultaneous devices propose alike.
  void trusted;
  return nextBusinessDocumentNumber({
    kind: "SO", existingNumbers: numbers, businessCode: prefix, date: at,
  });
}
