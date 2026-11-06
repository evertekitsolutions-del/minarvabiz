/**
 * Explicit authorization boundary for optional industry workflow commands.
 * The caller MUST supply grants from its trusted RBAC/entitlement backend.
 * Browser-local industry preferences are never authorization evidence.
 * Persistence must still enforce tenant/branch scope and atomic CAS.
 */
import { type IndustryWorkspaceProfile } from "./industry-workspace-profile";
import {
  applyIndustryWorkflowEvent,
  type IndustryWorkflowEvent,
  type IndustryWorkflowRecord,
} from "./industry-workflow-reducer";

export type IndustryWorkflowAccess = Readonly<{
  actorId: string;
  tenantId: string;
  branchId: string;
  /** Server-authorized, tenant-scoped workflow templates; never UI selections. */
  allowedTemplateIds: readonly string[];
  /** Server-authorized exact transition permissions for this actor. */
  allowedTransitions: readonly Readonly<{ templateId: string; from: string; to: string }>[];
}>;

const validId = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 128;

/** Guard + deterministic reducer; no network, storage or posting side effects. */
export function applyAuthorizedIndustryWorkflowEvent(
  profile: IndustryWorkspaceProfile,
  record: IndustryWorkflowRecord,
  event: IndustryWorkflowEvent,
  access: IndustryWorkflowAccess,
): IndustryWorkflowRecord {
  if (!access || !validId(access.actorId) || !validId(access.tenantId) ||
      !validId(access.branchId) || !Array.isArray(access.allowedTemplateIds) ||
      !Array.isArray(access.allowedTransitions)) {
    throw new Error("Industry workflow authorization required");
  }
  if (access.tenantId !== record.tenantId || access.branchId !== record.branchId ||
      access.tenantId !== event.tenantId || access.branchId !== event.branchId) {
    throw new Error("Industry workflow access scope mismatch");
  }
  if (!access.allowedTemplateIds.includes(record.templateId) ||
      !access.allowedTransitions.some(grant =>
        grant?.templateId === record.templateId &&
        grant.from === event.from && grant.to === event.to)) {
    throw new Error("Industry workflow transition not authorized");
  }
  return applyIndustryWorkflowEvent(profile, record, event);
}


/**
 * Preflight a bounded ordered batch without mutating the original record.
 * Storage adapters MUST persist the entire batch in one transaction using a
 * revision CAS, event-id uniqueness constraints, and the trusted RBAC context.
 * A successful preview is not a durable commit or authorization token.
 */
export function preflightAuthorizedIndustryWorkflowBatch(
  profile: IndustryWorkspaceProfile,
  record: IndustryWorkflowRecord,
  events: readonly IndustryWorkflowEvent[],
  access: IndustryWorkflowAccess,
): IndustryWorkflowRecord {
  if (!Array.isArray(events) || events.length === 0 || events.length > 100) {
    throw new Error("Invalid industry workflow batch size");
  }
  const seen = new Set<string>();
  let next = record;
  for (const event of events) {
    if (!event || typeof event.eventId !== "string" || seen.has(event.eventId)) {
      throw new Error("Duplicate or invalid industry workflow batch event");
    }
    seen.add(event.eventId);
    // Never accept duplicate committed events in a fresh batch, even if
    // a single-event retry could otherwise return an idempotent result.
    if (next.appliedEventIds.includes(event.eventId)) {
      throw new Error("Industry workflow batch contains committed event");
    }
    next = applyAuthorizedIndustryWorkflowEvent(profile, next, event, access);
  }
  return next;
}
