/**
 * FIN-004 / SAL-010 — scoped receivable payment allocation proposal.
 * Original Minarva Biz source; no third-party source incorporated.
 * Read-only domain proposal: a trusted host must atomically validate/post
 * receipts, ledger entries and idempotency keys under authoritative RBAC.
 */
export interface ReceivableScope {
  readonly tenantId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly currency: string;
}
export interface ReceivableInvoice extends ReceivableScope {
  readonly invoiceId: string;
  readonly customerId: string;
  readonly outstandingMinor: number;
  readonly dueDate: string;
}
export interface ReceivablePayment extends ReceivableScope {
  readonly paymentId: string;
  readonly customerId: string;
  readonly amountMinor: number;
  readonly idempotencyKey: string;
}
export interface ReceivableAllocation {
  readonly invoiceId: string;
  readonly amountMinor: number;
}
export interface ReceivableAllocationProposal {
  readonly paymentId: string;
  readonly idempotencyKey: string;
  readonly allocations: readonly ReceivableAllocation[];
  readonly unappliedMinor: number;
  readonly allocatedMinor: number;
}
function identifier(value: string, label: string): void {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)) {
    throw new Error("Invalid " + label);
  }
}
function amount(value: number, label: string, positive: boolean): void {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
    throw new Error("Invalid " + label + " minor units");
  }
}
function scope(value: ReceivableScope): void {
  identifier(value.tenantId, "tenant");
  identifier(value.companyId, "company");
  identifier(value.branchId, "branch");
  if (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency)) {
    throw new Error("Invalid currency");
  }
}
function sameScope(a: ReceivableScope, b: ReceivableScope): boolean {
  return a.tenantId === b.tenantId && a.companyId === b.companyId &&
    a.branchId === b.branchId && a.currency === b.currency;
}
/**
 * Allocates an authenticated receipt oldest-due-first, then invoice ID.
 * No rounding, writes, external calls or customer-specific industry defaults.
 * A replay with the same payment ID/key must be reconciled by the host,
 * not treated as a second receipt.
 */
export function proposeReceivableAllocation(
  payment: ReceivablePayment,
  invoices: readonly ReceivableInvoice[],
): ReceivableAllocationProposal {
  scope(payment);
  identifier(payment.paymentId, "payment ID");
  identifier(payment.customerId, "customer ID");
  identifier(payment.idempotencyKey, "idempotency key");
  amount(payment.amountMinor, "payment", true);
  if (!Array.isArray(invoices) || invoices.length > 10000) {
    throw new Error("Invalid invoice collection");
  }
  const seen = new Set<string>();
  const eligible = invoices.map((invoice) => {
    scope(invoice);
    identifier(invoice.invoiceId, "invoice ID");
    identifier(invoice.customerId, "customer ID");
    amount(invoice.outstandingMinor, "outstanding", false);
    if (!sameScope(payment, invoice) || payment.customerId !== invoice.customerId) {
      throw new Error("Receivable scope or customer mismatch");
    }
    if (seen.has(invoice.invoiceId)) throw new Error("Duplicate invoice ID");
    seen.add(invoice.invoiceId);
    if (typeof invoice.dueDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(invoice.dueDate) ||
        !Number.isFinite(Date.parse(invoice.dueDate + "T00:00:00Z")) ||
        new Date(invoice.dueDate + "T00:00:00Z").toISOString().slice(0, 10) !== invoice.dueDate) {
      throw new Error("Invalid invoice due date");
    }
    return invoice;
  }).filter((invoice) => invoice.outstandingMinor > 0);
  eligible.sort((a, b) => a.dueDate.localeCompare(b.dueDate) ||
    a.invoiceId.localeCompare(b.invoiceId));
  let remaining = payment.amountMinor;
  const allocations: ReceivableAllocation[] = [];
  for (const invoice of eligible) {
    if (remaining === 0) break;
    const allocated = Math.min(remaining, invoice.outstandingMinor);
    allocations.push({ invoiceId: invoice.invoiceId, amountMinor: allocated });
    remaining -= allocated;
  }
  return {
    paymentId: payment.paymentId,
    idempotencyKey: payment.idempotencyKey,
    allocations,
    allocatedMinor: payment.amountMinor - remaining,
    unappliedMinor: remaining,
  };
}
