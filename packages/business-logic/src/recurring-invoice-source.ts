/**
 * SAL-007 host-only source invoice -> recurrence rule builder.
 *
 * The web form supplies only an invoice reference + dates/frequency. The host
 * reads the authoritative issued invoice, current membership, customer and
 * products; it NEVER trusts renderer-supplied tenant/customer/line quantities.
 * This function creates a draft SCHEDULE only, not a commercial sale.
 */
import type { Sale, Customer, Product } from "@minarvabiz/types";
import {
  createRecurringInvoiceSchedule,
  type RecurringInvoiceInput, type RecurringInvoiceSchedule,
} from "./recurring-invoice";

export type RecurringInvoiceSourceRequest = Pick<
  RecurringInvoiceInput, "id" | "organizationId" | "companyId" | "branchId" |
  "currency" | "sourceSaleId" | "firstDueDate" | "frequency" | "interval" |
  "endDate" | "maxOccurrences" | "notes"
>;
export interface RecurringInvoiceAuthoritativeSource {
  /** Implementation must check signed-in user's org/branch & subscription authority. */
  authorizeScheduleCreation: (orgId: string, companyId: string, branchId: string) => void;
  getSale: (saleId: string) => Sale | undefined;
  getCustomer: (customerId: string) => Customer | undefined;
  getProduct: (productId: string) => Product | undefined;
}

function milliQuantity(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Source invoice has an invalid product quantity");
  }
  const milli = Math.round(value * 1000);
  if (!Number.isSafeInteger(milli) || milli <= 0 || milli > 1_000_000_000 ||
      Math.abs(milli / 1000 - value) > 1e-9) {
    throw new Error("Source invoice line exceeds exact 0.001 quantity precision");
  }
  return milli;
}

export function createRecurringInvoiceScheduleFromSource(
  request: RecurringInvoiceSourceRequest,
  source: RecurringInvoiceAuthoritativeSource,
): RecurringInvoiceSchedule {
  if (!request || !source ||
      typeof source.authorizeScheduleCreation !== "function" ||
      typeof source.getSale !== "function" ||
      typeof source.getCustomer !== "function" ||
      typeof source.getProduct !== "function") {
    throw new Error("A trusted recurring invoice source adapter is required");
  }
  // No tenant scope is inferred from a browser form. The caller must supply an
  // authenticated server/desktop context and fail-closed permission check.
  source.authorizeScheduleCreation(
    request.organizationId, request.companyId, request.branchId,
  );
  const issued = source.getSale(request.sourceSaleId);
  if (!issued || issued.id !== request.sourceSaleId ||
      issued.branchId !== request.branchId ||
      issued.deletedAt || !["completed", "partial"].includes(issued.status) ||
      !issued.customerId || !Array.isArray(issued.items) ||
      issued.items.length === 0 || issued.items.length > 100) {
    throw new Error("Issued source invoice is missing or not eligible in this branch");
  }
  const customer = source.getCustomer(issued.customerId);
  if (!customer || customer.id !== issued.customerId ||
      customer.deletedAt ||
      (customer.branchId != null && customer.branchId !== request.branchId)) {
    throw new Error("Source invoice customer not found in authorised branch");
  }
  const amounts = new Map<string, number>();
  for (const item of issued.items) {
    if (item.dimensionMetadata != null) {
      throw new Error("Measured invoices require a dedicated dimension recurrence adapter");
    }
    const product = source.getProduct(item.productId);
    if (!product || product.id !== item.productId || !product.isActive ||
        product.deletedAt ||
        (product.branchId != null && product.branchId !== request.branchId)) {
      throw new Error("Source invoice contains an inactive or foreign-branch product");
    }
    const sum = (amounts.get(item.productId) ?? 0) + milliQuantity(item.quantity);
    if (!Number.isSafeInteger(sum) || sum > 1_000_000_000) {
      throw new Error("Recurring source aggregate quantity exceeds allowed range");
    }
    amounts.set(item.productId, sum);
  }
  return createRecurringInvoiceSchedule({
    ...request, customerId: customer.id,
    lines: [...amounts].map(([productId, quantityMilli]) => ({
      productId, quantityMilli,
    })),
  });
}
