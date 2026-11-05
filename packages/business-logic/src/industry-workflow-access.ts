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
