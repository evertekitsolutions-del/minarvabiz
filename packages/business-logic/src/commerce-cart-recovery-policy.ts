/**
 * COM-010: fail-closed abandoned-cart recovery eligibility.
 * Original Minarva Biz implementation, no third-party source copied.
 *
 * Pure decision only: caller must verify identity/grants and marketing consent
 * from authoritative storage, persist a durable send reservation and re-check
 * consent at send time. No messages, payment or customer writes occur here.
 */
export interface CartRecoveryScope {
  tenantId: string;
  companyId: string;
  branchId: string;
}
export interface CartRecoverySnapshot extends CartRecoveryScope {
  cartId: string;
  customerId: string;
  revision: number;
  status: "active" | "checked_out" | "cancelled";
  updatedAtMs: number;
  emailVerified: boolean;
  emailConsentVerified: boolean;
  lastRecoverySentAtMs: number | null;
}
export interface CartRecoveryPolicy {
  enabled: boolean;
  minimumIdleMinutes: number;
  cooldownMinutes: number;
  maxAgeMinutes: number;
}
export type CartRecoveryDecision =
  | { eligible: true; cartId: string; revision: number; reservationKey: string }
  | { eligible: false; reason: "disabled" | "not_active" | "unverified_consent" | "too_recent" | "expired" | "cooldown" };

function canonicalId(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value)) {
    throw new Error("Invalid " + name);
  }
}
function minute(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 5256000) throw new Error("Invalid " + name);
}
function time(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid " + name);
}
/**
 * Scope is supplied by a verified server-side actor, never by storefront input.
 * An eligible result is NOT authorization to send; atomic reservation, suppression
 * list and current consent must be checked again by the delivery worker.
 */
export function evaluateCartRecovery(
  scope: CartRecoveryScope,
  cart: CartRecoverySnapshot,
  policy: CartRecoveryPolicy,
  nowMs: number,
): CartRecoveryDecision {
  if (!scope || !cart || !policy) throw new Error("Missing recovery context");
  for (const field of ["tenantId", "companyId", "branchId"] as const) {
    canonicalId(scope[field], field);
    canonicalId(cart[field], "cart " + field);
    if (scope[field] !== cart[field]) throw new Error("Cart scope mismatch");
  }
  canonicalId(cart.cartId, "cartId");
  canonicalId(cart.customerId, "customerId");
  if (!Number.isSafeInteger(cart.revision) || cart.revision < 0) throw new Error("Invalid cart revision");
  if (!["active", "checked_out", "cancelled"].includes(cart.status)) throw new Error("Invalid cart status");
  if (typeof policy.enabled !== "boolean" || typeof cart.emailVerified !== "boolean" ||
    typeof cart.emailConsentVerified !== "boolean") throw new Error("Invalid recovery flags");
  minute(policy.minimumIdleMinutes, "minimum idle");
  minute(policy.cooldownMinutes, "cooldown");
  minute(policy.maxAgeMinutes, "maximum age");
  if (policy.minimumIdleMinutes <= 0 || policy.cooldownMinutes <= 0 ||
    policy.maxAgeMinutes < policy.minimumIdleMinutes) throw new Error("Invalid recovery window");
  time(nowMs, "current time");
  time(cart.updatedAtMs, "cart update");
  if (cart.updatedAtMs > nowMs) throw new Error("Future cart update");
  if (cart.lastRecoverySentAtMs !== null) {
    time(cart.lastRecoverySentAtMs, "last send");
    if (cart.lastRecoverySentAtMs > nowMs) throw new Error("Future recovery send");
  }
  if (!policy.enabled) return { eligible: false, reason: "disabled" };
  if (cart.status !== "active") return { eligible: false, reason: "not_active" };
  if (!cart.emailVerified || !cart.emailConsentVerified) return { eligible: false, reason: "unverified_consent" };
  const idle = nowMs - cart.updatedAtMs;
  if (idle < policy.minimumIdleMinutes * 60000) return { eligible: false, reason: "too_recent" };
  if (idle > policy.maxAgeMinutes * 60000) return { eligible: false, reason: "expired" };
  if (cart.lastRecoverySentAtMs !== null &&
    nowMs - cart.lastRecoverySentAtMs < policy.cooldownMinutes * 60000) {
    return { eligible: false, reason: "cooldown" };
  }
  return {
    eligible: true, cartId: cart.cartId, revision: cart.revision,
    reservationKey: JSON.stringify([scope.tenantId, scope.companyId, scope.branchId, cart.cartId, cart.revision, "email"]),
  };
}
