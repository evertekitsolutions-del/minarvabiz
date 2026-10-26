/** Financial sync envelope contract (A-SYNC-V2). Durable idempotency must be enforced by the receiving database transaction. */
export const FINANCIAL_SYNC_SCHEMA_VERSION = 1 as const;

export const FINANCIAL_SYNC_EVENT_TYPES = [
  "sale.posted",
  "payment.recorded",
  "refund.posted",
  "purchase.received",
  "stock.adjusted",
  "journal.posted",
] as const;

export type FinancialSyncEventType = (typeof FINANCIAL_SYNC_EVENT_TYPES)[number];

export interface FinancialSyncEnvelope {
  readonly schemaVersion: typeof FINANCIAL_SYNC_SCHEMA_VERSION;
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly deviceId: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: FinancialSyncEventType;
  readonly currency: string;
  readonly occurredAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export type FinancialEnvelopeValidation =
  | { readonly ok: true; readonly envelope: FinancialSyncEnvelope }
  | { readonly ok: false; readonly errors: readonly string[] };

export type FinancialEnvelopeAcceptance =
  | { readonly status: "accepted"; readonly envelope: FinancialSyncEnvelope }
  | { readonly status: "duplicate"; readonly originalEventId: string }
  | { readonly status: "idempotency-conflict"; readonly originalEventId: string; readonly error: string }
  | { readonly status: "invalid"; readonly errors: readonly string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 200;

function canonicalUtc(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function jsonSafe(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;

  seen.add(value);
  let valid: boolean;
  if (Array.isArray(value)) {
    valid = Array.from(value).every((item) => jsonSafe(item, seen));
  } else if (isRecord(value)) {
    valid = Object.keys(value).every((key) => jsonSafe(value[key], seen));
  } else {
    valid = false;
  }
  seen.delete(value);
  return valid;
}

function cloneJsonValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item)) as T;
  }
  if (isRecord(value)) {
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(value)) copy[key] = cloneJsonValue(value[key]);
    return copy as T;
  }
  return value;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  if (isRecord(value)) {
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value) ?? "null";
}

function fingerprint(envelope: FinancialSyncEnvelope): string {
  return canonicalJson({
    tenantId: envelope.tenantId,
    companyId: envelope.companyId,
    branchId: envelope.branchId,
    deviceId: envelope.deviceId,
    aggregateType: envelope.aggregateType,
    aggregateId: envelope.aggregateId,
    eventType: envelope.eventType,
    currency: envelope.currency,
    payload: envelope.payload,
  });
}

export function validateFinancialSyncEnvelope(value: unknown): FinancialEnvelopeValidation {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ["Envelope must be a plain object"] };
  }

  if (value.schemaVersion !== FINANCIAL_SYNC_SCHEMA_VERSION) {
    errors.push("Unsupported schemaVersion");
  }

  const identityFields = [
    "eventId",
    "idempotencyKey",
    "tenantId",
    "companyId",
    "branchId",
    "deviceId",
    "aggregateType",
    "aggregateId",
  ] as const;
  for (const field of identityFields) {
    if (!nonEmpty(value[field])) {
      errors.push(field + " must be a non-empty string of at most 200 characters");
    }
  }

  if (!FINANCIAL_SYNC_EVENT_TYPES.includes(value.eventType as FinancialSyncEventType)) {
    errors.push("Unsupported financial eventType");
  }
  if (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency)) {
    errors.push("currency must be a three-letter uppercase ISO-style code");
  }
  if (!canonicalUtc(value.occurredAt)) {
    errors.push("occurredAt must be a canonical UTC timestamp with milliseconds");
  }
  if (!isRecord(value.payload)) {
    errors.push("payload must be a plain object");
  } else if (!jsonSafe(value.payload)) {
    errors.push("payload must contain only finite JSON-safe values without cycles");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    envelope: {
      schemaVersion: FINANCIAL_SYNC_SCHEMA_VERSION,
      eventId: value.eventId as string,
      idempotencyKey: value.idempotencyKey as string,
      tenantId: value.tenantId as string,
      companyId: value.companyId as string,
      branchId: value.branchId as string,
      deviceId: value.deviceId as string,
      aggregateType: value.aggregateType as string,
      aggregateId: value.aggregateId as string,
      eventType: value.eventType as FinancialSyncEventType,
      currency: value.currency as string,
      occurredAt: value.occurredAt as string,
      payload: cloneJsonValue(value.payload as Record<string, unknown>),
    },
  };
}

/** In-process detector for adapters/tests; production requires durable DB uniqueness + transaction. */
export class FinancialEnvelopeDeduplicator {
  private readonly seen = new Map<string, { eventId: string; fingerprint: string }>();

  accept(value: unknown): FinancialEnvelopeAcceptance {
    const result = validateFinancialSyncEnvelope(value);
    if (!result.ok) return { status: "invalid", errors: result.errors };

    const envelope = result.envelope;
    const key = JSON.stringify([envelope.tenantId, envelope.idempotencyKey]);
    const commandFingerprint = fingerprint(envelope);
    const prior = this.seen.get(key);

    if (prior) {
      if (prior.fingerprint === commandFingerprint) {
        return { status: "duplicate", originalEventId: prior.eventId };
      }
      return {
        status: "idempotency-conflict",
        originalEventId: prior.eventId,
        error: "Idempotency key was already used for a different financial command",
      };
    }

    this.seen.set(key, { eventId: envelope.eventId, fingerprint: commandFingerprint });
    return { status: "accepted", envelope };
  }

  clear(): void {
    this.seen.clear();
  }

  get size(): number {
    return this.seen.size;
  }
}
