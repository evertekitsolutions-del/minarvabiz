/**
 * COM-003/004/006 — optional merchant-specific COD delivery-charge prepayment.
 * Pure, offline-safe policy evaluation. No checkout, payment capture, or shipment
 * authority is created here; the trusted checkout adapter must revalidate it.
 * All monetary values are integer minor units in the configured currency.
 */
export interface CommercePaymentScope {
  tenantId: string;
  companyId: string;
  branchId: string;
  currency: string;
}

export interface CommerceShippingPolicy extends CommercePaymentScope {
  commerceEnabled: boolean;
  codEnabled: boolean;
  /** When enabled, the delivery fee must be settled before COD dispatch. */
  requireCodShippingPrepayment: boolean;
}

export interface CommerceShippingQuote extends CommercePaymentScope {
  orderId: string;
  itemsTotalMinor: number;
  shippingMinor: number;
}

export interface CommercePaymentEvidence extends CommercePaymentScope {
  orderId: string;
  /** Only the trusted payment reconciliation adapter may set verified=true. */
  verified: boolean;
  settledShippingMinor: number;
}

export type CommercePaymentMethod = "prepaid" | "cod";

export type CodDispatchDecision =
  | { allowed: true; shippingPrepaymentDueMinor: 0; reason: "ready" }
  | { allowed: false; shippingPrepaymentDueMinor: number; reason:
      "commerce_disabled" | "cod_disabled" | "scope_mismatch" |
      "invalid_amount" | "unverified_payment" | "shipping_prepayment_due" };

function validScope(scope: CommercePaymentScope): boolean {
  return [scope.tenantId, scope.companyId, scope.branchId].every(
    (value) => typeof value === "string" && value.trim().length > 0,
  ) && /^[A-Z]{3}$/.test(scope.currency);
}

function sameScope(a: CommercePaymentScope, b: CommercePaymentScope): boolean {
  return a.tenantId === b.tenantId && a.companyId === b.companyId &&
    a.branchId === b.branchId && a.currency === b.currency;
}

function minor(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Fail closed: a shipping quote, order, merchant policy and verified receipt
 * must agree on tenant/company/branch/currency and order identity.
 * The returned due is informational, not authorization to collect money.
 */
export function evaluateCodShippingPrepayment(
  policy: CommerceShippingPolicy,
  quote: CommerceShippingQuote,
  method: CommercePaymentMethod,
  evidence?: CommercePaymentEvidence | null,
): CodDispatchDecision {
  const deny = (reason: Exclude<CodDispatchDecision["reason"], "ready">, due = 0):
    CodDispatchDecision => ({ allowed: false, shippingPrepaymentDueMinor: due, reason });
  if (!validScope(policy) || !validScope(quote) ||
      !sameScope(policy, quote) || !quote.orderId.trim()) {
    return deny("scope_mismatch");
  }
  if (!policy.commerceEnabled) return deny("commerce_disabled");
  if (!minor(quote.itemsTotalMinor) || !minor(quote.shippingMinor) ||
      !Number.isSafeInteger(quote.itemsTotalMinor + quote.shippingMinor)) {
    return deny("invalid_amount");
  }
  if (method !== "cod" && method !== "prepaid") return deny("invalid_amount");
  if (method === "prepaid") return { allowed: true, shippingPrepaymentDueMinor: 0, reason: "ready" };
  if (!policy.codEnabled) return deny("cod_disabled");
  if (!policy.requireCodShippingPrepayment || quote.shippingMinor === 0) {
    return { allowed: true, shippingPrepaymentDueMinor: 0, reason: "ready" };
  }
  if (!evidence) return deny("shipping_prepayment_due", quote.shippingMinor);
  if (!validScope(evidence) || !sameScope(policy, evidence) ||
      evidence.orderId !== quote.orderId) return deny("scope_mismatch");
  if (!minor(evidence.settledShippingMinor)) return deny("invalid_amount");
  const due = Math.max(0, quote.shippingMinor - evidence.settledShippingMinor);
  if (!evidence.verified) return deny("unverified_payment", quote.shippingMinor);
  if (due > 0) return deny("shipping_prepayment_due", due);
  return { allowed: true, shippingPrepaymentDueMinor: 0, reason: "ready" };
}
