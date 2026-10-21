/**
 * SAL-007: preview one due recurrence against LIVE Minarva checkout master data.
 *
 * Does not mutate any store or create a sale. Trusted host lookups and
 * authorisation are REQUIRED. The real sale writer must repeat its own
 * authoritative warehouse, pricing, tax, permissions and journal checks.
 */
import type { CartLine, Product, Customer, Sale } from "@minarvabiz/types";
import {
  recurringInvoiceDueDate, planRecurringInvoiceDue,
  type RecurringInvoiceSchedule, type RecurringInvoiceOccurrence,
} from "./recurring-invoice";
import { calculateCartTotals, validateCart, type CartTotals } from "./sales";

export interface RecurringInvoiceVerifiedReaders {
  /** Host-owned, signed-in principal permission check; do not use renderer flags. */
  authorize: (organizationId: string, companyId: string, branchId: string) => void;
  /** Tenant/branch-scoped resolvers provided by the trusted host. */
  getSourceSale: (saleId: string) => Sale | undefined;
  getCustomer: (customerId: string) => Customer | undefined;
  getProduct: (productId: string) => Product | undefined;
}
export interface RecurringInvoiceCartPreview {
  readonly kind: "nonbinding_recurring_invoice_checkout_preview";
  readonly occurrenceId: string;
  readonly scheduleId: string;
  readonly organizationId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly customerId: string;
  readonly sourceSaleId: string;
  readonly dueDate: string;
  readonly currency: string;
  readonly lines: readonly CartLine[];
  readonly totals: CartTotals;
  readonly requiresManualApproval: true;
  readonly requiresFinalCheckoutRevalidation: true;
}

const validIso = (date: string): boolean =>
  typeof date === "string" && /^20\d{2}-\d{2}-\d{2}$/.test(date) &&
  !Number.isNaN(Date.parse(date)) && new Date(Date.parse(date)).toISOString().slice(0, 10) === date;

/** Use this only after reading the pending occurrence from persisted trusted data. */
export function prepareRecurringInvoiceCartPreview(
  schedule: RecurringInvoiceSchedule,
  occurrence: RecurringInvoiceOccurrence,
  asOfDate: string,
  readers: RecurringInvoiceVerifiedReaders,
): RecurringInvoiceCartPreview {
  if (!schedule || !occurrence || !readers ||
      typeof readers.authorize !== "function" ||
      typeof readers.getSourceSale !== "function" ||
      typeof readers.getProduct !== "function" ||
      typeof readers.getCustomer !== "function") {
    throw new Error("Recurring invoice preview requires trusted host readers");
  }
  // In addition to the active status check, this validates ALL schedule fields.
  planRecurringInvoiceDue(schedule, schedule.firstDueDate, [], 1);
  if (schedule.status !== "active") throw new Error("Only active recurring invoices can be reviewed");
  if (!validIso(asOfDate)) throw new Error("Preview must use a valid business date");
  const dueDate = recurringInvoiceDueDate(schedule, occurrence.sequence);
  if (occurrence.kind !== "invoice_draft_pending_review" ||
      occurrence.id !== `${schedule.id}:${occurrence.sequence}` ||
      occurrence.scheduleId !== schedule.id ||
      occurrence.organizationId !== schedule.organizationId ||
      occurrence.companyId !== schedule.companyId ||
      occurrence.branchId !== schedule.branchId ||
      occurrence.dueDate !== dueDate ||
      dueDate > asOfDate ||
      (schedule.endDate !== null && dueDate > schedule.endDate)) {
    throw new Error("Recurring invoice draft is not an authorised due occurrence");
  }
  readers.authorize(schedule.organizationId, schedule.companyId, schedule.branchId);
  const sale = readers.getSourceSale(schedule.sourceSaleId);
  if (!sale || sale.id !== schedule.sourceSaleId ||
      sale.branchId !== schedule.branchId ||
      sale.customerId !== schedule.customerId ||
      !["completed", "partial"].includes(sale.status) ||
      sale.deletedAt || !Array.isArray(sale.items) || sale.items.length === 0) {
    throw new Error("Original posted invoice is missing or outside branch/customer scope");
  }
  const customer = readers.getCustomer(schedule.customerId);
  if (!customer || customer.id !== schedule.customerId ||
      customer.deletedAt || (customer.branchId != null &&
      customer.branchId !== schedule.branchId)) {
    throw new Error("Recurring invoice customer is not active in this branch");
  }
  const sourceProductIds = new Set(sale.items.map((item) => item.productId));
  // Multiple rows of the same product without dimensions are supported; the
  // schedule itself remains an explicit product/quantity list.
  if (sale.items.some((item) => item.dimensionMetadata != null)) {
    throw new Error("Measured source invoices require a dimension-aware recurrence adapter");
  }
  const lines: CartLine[] = schedule.lines.map(({ productId, quantityMilli }) => {
    if (!sourceProductIds.has(productId)) {
      throw new Error("Recurring invoice product was not on the original invoice");
    }
    const product = readers.getProduct(productId);
    if (!product || product.id !== productId ||
        !product.isActive || product.deletedAt ||
        (product.branchId != null && product.branchId !== schedule.branchId)) {
      throw new Error("Recurring invoice product is inactive or outside branch scope");
    }
    const line: CartLine = {
      productId: product.id,
      productName: product.name,
      sku: product.sku ?? null,
      barcode: product.barcode ?? null,
      quantity: quantityMilli / 1000,
      unitPrice: product.sellingPrice,
      costPrice: product.costPrice,
      discountPercent: product.discount ?? 0,
      taxRate: product.taxRate ?? 0,
      stockQuantity: product.stockQuantity,
    };
    return line;
  });
  const errors = validateCart(lines);
  if (errors.length) throw new Error(`Recurring invoice live checkout preview blocked: ${errors.join("; ")}`);
  const totals = calculateCartTotals(lines);
  if (!Number.isFinite(totals.grandTotal) || totals.grandTotal < 0) {
    throw new Error("Recurring invoice preview has invalid totals");
  }
  return {
    kind: "nonbinding_recurring_invoice_checkout_preview",
    occurrenceId: occurrence.id, scheduleId: schedule.id,
    organizationId: schedule.organizationId,
    companyId: schedule.companyId, branchId: schedule.branchId,
    customerId: schedule.customerId, sourceSaleId: schedule.sourceSaleId,
    dueDate, currency: schedule.currency, lines, totals,
    requiresManualApproval: true,
    requiresFinalCheckoutRevalidation: true,
  };
}
