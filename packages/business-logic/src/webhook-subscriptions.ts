/**
 * INT-002 — tenant-scoped, opt-in webhook subscription policy.
 * Pure shared contract; storage, secrets, DNS revalidation and dispatch belong
 * to a separately reviewed integration adapter. No network calls are made here.
 * Original implementation; no third-party source copied.
 */
export type WebhookEvent = "customer.created" | "invoice.created" | "invoice.paid" | "stock.low";
export type WebhookScope = Readonly<{ tenantId: string; companyId: string; branchId?: string }>;
export interface WebhookSubscription {
  id: string;
  scope: WebhookScope;
  endpoint: string;
  events: WebhookEvent[];
  enabled: boolean;
  revision: number;
  updatedAt: string;
}
export interface WebhookMutation {
  id: string;
  endpoint: string;
  events: WebhookEvent[];
  enabled: boolean;
}
const EVENTS = new Set<WebhookEvent>(["customer.created", "invoice.created", "invoice.paid", "stock.low"]);
const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
function requireId(value: string, field: string): string {
  if (typeof value !== "string" || !VALID_ID.test(value)) throw new Error(`Invalid ${field}`);
  return value;
}
export function validateWebhookScope(scope: WebhookScope): WebhookScope {
  if (!scope || typeof scope !== "object") throw new Error("Invalid scope");
  return {
    tenantId: requireId(scope.tenantId, "tenantId"),
    companyId: requireId(scope.companyId, "companyId"),
    ...(scope.branchId === undefined ? {} : { branchId: requireId(scope.branchId, "branchId") }),
  };
}
export function sameWebhookScope(a: WebhookScope, b: WebhookScope): boolean {
  return a.tenantId === b.tenantId && a.companyId === b.companyId && a.branchId === b.branchId;
}
export function validateWebhookEndpoint(input: string): string {
  if (typeof input !== "string" || input.length > 2048) throw new Error("Invalid webhook endpoint");
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("Invalid webhook endpoint"); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash) {
    throw new Error("Webhook endpoint must be a public HTTPS URL without credentials or fragment");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host.endsWith(".internal") || host.endsWith(".test") || host.endsWith(".invalid") ||
      host.endsWith(".example") || host.endsWith(".onion") || host.endsWith(".arpa") ||
      host.endsWith(".home.arpa") || !host.includes(".") || host.includes(":") ||
      host.startsWith("[") || IPV4.test(host) || host === "0.0.0.0") {
    // Reject literal IPs, including public ones: delivery adapters must resolve
    // and pin vetted public DNS targets on every connection and redirect.
    throw new Error("Webhook endpoint must use a public DNS hostname");
  }
  if (host.length > 253 || !/^[a-z0-9.-]+$/.test(host) ||
      host.split(".").some((part) => !part || part.length > 63 || part.startsWith("-") || part.endsWith("-"))) {
    throw new Error("Invalid webhook hostname");
  }
  return url.toString();
}
export function validateWebhookEvents(input: readonly string[]): WebhookEvent[] {
  if (!Array.isArray(input) || !input.length || input.length > EVENTS.size ||
      input.some((event) => !EVENTS.has(event as WebhookEvent))) throw new Error("Invalid webhook events");
  return [...new Set(input as WebhookEvent[])].sort();
}
/** Revision-based optimistic concurrency: stale writers must not overwrite newer settings. */
export function upsertWebhookSubscription(input: {
  scope: WebhookScope;
  mutation: WebhookMutation;
  current?: WebhookSubscription | null;
  expectedRevision: number;
  now: string;
}): WebhookSubscription {
  const scope = validateWebhookScope(input.scope);
  const id = requireId(input.mutation?.id, "subscriptionId");
  const current = input.current ?? null;
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 ||
      (current ? current.revision !== input.expectedRevision : input.expectedRevision !== 0)) {
    throw new Error("Webhook revision conflict");
  }
  if (current && (current.id !== id || !sameWebhookScope(current.scope, scope))) {
    throw new Error("Webhook subscription scope mismatch");
  }
  if (typeof input.mutation.enabled !== "boolean") throw new Error("Invalid enabled state");
  const timestamp = new Date(input.now);
  if (!Number.isFinite(timestamp.getTime())) throw new Error("Invalid timestamp");
  return {
    id, scope, endpoint: validateWebhookEndpoint(input.mutation.endpoint),
    events: validateWebhookEvents(input.mutation.events),
    enabled: input.mutation.enabled,
    revision: input.expectedRevision + 1,
    updatedAt: timestamp.toISOString(),
  };
}
/** Authorization must be checked by the caller before this scope-filtered lookup. */
export function listWebhookSubscriptionsForScope(
  subscriptions: readonly WebhookSubscription[], scope: WebhookScope,
): WebhookSubscription[] {
  const validScope = validateWebhookScope(scope);
  return subscriptions.filter((entry) => sameWebhookScope(entry.scope, validScope))
    .map((entry) => ({ ...entry, scope: { ...entry.scope }, events: [...entry.events] }));
}
export function shouldDispatchWebhook(
  subscription: WebhookSubscription, scope: WebhookScope, event: WebhookEvent,
): boolean {
  return subscription.enabled === true && sameWebhookScope(subscription.scope, validateWebhookScope(scope)) &&
    EVENTS.has(event) && subscription.events.includes(event);
}
