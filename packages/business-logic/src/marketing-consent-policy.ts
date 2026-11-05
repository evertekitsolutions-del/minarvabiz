/**
 * MKT-016 / CRM-017 — optional tenant-scoped marketing consent ledger policy.
 *
 * Pure offline-safe reducer. The host must persist accepted events atomically,
 * authenticate the actor and scope, and use a trusted provider send adapter.
 * This module never sends messages, grants permissions or modifies customer data.
 * No third-party code copied.
 */
export type MarketingChannel = "email" | "sms" | "whatsapp";
export type MarketingPurpose = "promotional" | "loyalty";
export type MarketingConsentAction = "opt_in" | "opt_out";

export interface MarketingConsentScope {
  tenantId: string;
  companyId: string;
  branchId: string;
}

export interface MarketingConsentEvent extends MarketingConsentScope {
  eventId: string;
  customerId: string;
  channel: MarketingChannel;
  purpose: MarketingPurpose;
  action: MarketingConsentAction;
  /** UTC ISO timestamp supplied by a trusted host, never a marketing client. */
  recordedAt: string;
  /** Monotonically increasing revision for this customer/channel/purpose. */
  revision: number;
  /** Nonempty source such as customer_portal or staff_verified_request. */
  source: string;
}

export interface MarketingConsentPolicy extends MarketingConsentScope {
  marketingEnabled: boolean;
  /** The authenticated host must resolve this to the exact business scope. */
  actorCanManageConsent: boolean;
}

export type MarketingConsentDecision =
  | { accepted: true; current: MarketingConsentEvent }
  | { accepted: false; reason:
      "invalid_event" | "scope_mismatch" | "permission_denied" |
      "stale_revision" | "conflicting_event" };

const filled = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value === value.trim();
const validScope = (scope: MarketingConsentScope): boolean =>
  filled(scope.tenantId) && filled(scope.companyId) && filled(scope.branchId);
const sameScope = (a: MarketingConsentScope, b: MarketingConsentScope): boolean =>
  a.tenantId === b.tenantId && a.companyId === b.companyId && a.branchId === b.branchId;
const validEvent = (event: MarketingConsentEvent): boolean =>
  validScope(event) && filled(event.eventId) && filled(event.customerId) &&
  filled(event.source) &&
  (event.channel === "email" || event.channel === "sms" || event.channel === "whatsapp") &&
  (event.purpose === "promotional" || event.purpose === "loyalty") &&
  (event.action === "opt_in" || event.action === "opt_out") &&
  Number.isSafeInteger(event.revision) && event.revision > 0 &&
  typeof event.recordedAt === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(event.recordedAt) &&
  Number.isFinite(Date.parse(event.recordedAt)) &&
  new Date(event.recordedAt).toISOString() ===
    new Date(Date.parse(event.recordedAt)).toISOString();

/** Apply one scoped CAS event. Persist accepted events in the host transaction. */
export function applyMarketingConsentEvent(
  policy: MarketingConsentPolicy,
  previous: MarketingConsentEvent | null,
  next: MarketingConsentEvent,
): MarketingConsentDecision {
  const reject = (reason: Exclude<MarketingConsentDecision["reason"], never>) =>
    ({ accepted: false as const, reason });
  if (!validEvent(next) || !validScope(policy)) return reject("invalid_event");
  if (!sameScope(policy, next)) return reject("scope_mismatch");
  // Opt-out is always permitted, even after a merchant disables marketing.
  if (next.action === "opt_in" && (!policy.marketingEnabled || !policy.actorCanManageConsent)) {
    return reject("permission_denied");
  }
  if (previous !== null) {
    if (!validEvent(previous)) return reject("invalid_event");
    if (!sameScope(previous, next) || previous.customerId !== next.customerId ||
        previous.channel !== next.channel || previous.purpose !== next.purpose) {
      return reject("scope_mismatch");
    }
    if (previous.eventId === next.eventId) {
      return previous.revision === next.revision &&
        previous.action === next.action && previous.recordedAt === next.recordedAt &&
        previous.source === next.source
        ? { accepted: true, current: previous } : reject("conflicting_event");
    }
    if (next.revision !== previous.revision + 1) return reject("stale_revision");
    if (Date.parse(next.recordedAt) < Date.parse(previous.recordedAt)) return reject("stale_revision");
  } else if (next.revision !== 1) {
    return reject("stale_revision");
  }
  return { accepted: true, current: next };
}

export interface MarketingSendContext extends MarketingConsentScope {
  marketingEnabled: boolean;
  customerId: string;
  channel: MarketingChannel;
  purpose: MarketingPurpose;
}

/** Fail closed. A consent event is not a delivery authorization or send API. */
export function maySendMarketingMessage(
  context: MarketingSendContext,
  current: MarketingConsentEvent | null,
): boolean {
  return validScope(context) && context.marketingEnabled === true &&
    filled(context.customerId) &&
    (context.channel === "email" || context.channel === "sms" || context.channel === "whatsapp") &&
    (context.purpose === "promotional" || context.purpose === "loyalty") &&
    current !== null && validEvent(current) && sameScope(context, current) &&
    current.customerId === context.customerId &&
    current.channel === context.channel && current.purpose === context.purpose &&
    current.action === "opt_in";
}
