/**
 * Deterministic industry workflow state reducer for offline/online adapters.
 * No database writes, entitlement decisions or financial/stock side effects.
 * Persistence adapters MUST enforce authorization and atomic compare-and-swap.
 */
import { type IndustryWorkspaceProfile, validateIndustryProfile } from "./industry-workspace-profile";
import { listIndustryWorkflowTemplates } from "./industry-workflow-templates";

export type IndustryWorkflowRecord = Readonly<{
  id: string;
  tenantId: string;
  branchId: string;
  templateId: string;
  stage: string;
  revision: number;
  appliedEventIds: readonly string[];
}>;

export type IndustryWorkflowEvent = Readonly<{
  eventId: string;
  tenantId: string;
  branchId: string;
  expectedRevision: number;
  from: string;
  to: string;
}>;

function nonempty(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 128;
}

export function createIndustryWorkflowRecord(
  profile: IndustryWorkspaceProfile,
  args: { id: string; tenantId: string; branchId: string; templateId: string },
): IndustryWorkflowRecord {
  validateIndustryProfile(profile);
  if (![args.id, args.tenantId, args.branchId, args.templateId].every(nonempty)) {
    throw new Error("Missing workflow scope");
  }
  const template = listIndustryWorkflowTemplates(profile).find(item => item.id === args.templateId);
  if (!template) throw new Error("Industry workflow is not selected");
  return { ...args, stage: template.stages[0], revision: 0, appliedEventIds: [] };
}

/**
 * Rebuild a workflow from an ordered durable event log before accepting writes.
 * Adapters should read the log and revision within the same transaction, then
 * persist the next event with an atomic expected-revision check.
 * A partial, reordered or forged log is rejected rather than silently repaired.
 */
export function replayIndustryWorkflowEvents(
  profile: IndustryWorkspaceProfile,
  args: { id: string; tenantId: string; branchId: string; templateId: string },
  events: readonly IndustryWorkflowEvent[],
): IndustryWorkflowRecord {
  if (!Array.isArray(events) || events.length > 10000) {
    throw new Error("Invalid industry workflow event log");
  }
  let record = createIndustryWorkflowRecord(profile, args);
  for (const event of events) {
    if (!event || typeof event !== "object" || !nonempty(event.eventId) ||
        !nonempty(event.from) || !nonempty(event.to)) {
      throw new Error("Invalid industry workflow event log");
    }
    record = applyIndustryWorkflowEvent(profile, record, event);
  }
  return record;
}

/**
 * Fail closed on cross-tenant/branch replay, stale revisions and skipped stages.
 * Duplicate event IDs are accepted ONLY when caller supplies the same committed
 * target stage; persistence adapters must retain event history for durable replay.
 */
export function applyIndustryWorkflowEvent(
  profile: IndustryWorkspaceProfile,
  record: IndustryWorkflowRecord,
  event: IndustryWorkflowEvent,
): IndustryWorkflowRecord {
  validateIndustryProfile(profile);
  if (![record.id, record.tenantId, record.branchId, event.eventId, event.tenantId, event.branchId].every(nonempty)) {
    throw new Error("Invalid workflow identity");
  }
  if (record.tenantId !== event.tenantId || record.branchId !== event.branchId) {
    throw new Error("Workflow scope mismatch");
  }
  const template = listIndustryWorkflowTemplates(profile).find(item => item.id === record.templateId);
  if (!template) throw new Error("Industry workflow is not selected");
  if (!Number.isSafeInteger(record.revision) || record.revision < 0 ||
      !Number.isSafeInteger(event.expectedRevision) || event.expectedRevision < 0 ||
      !Array.isArray(record.appliedEventIds) ||
      record.appliedEventIds.some(id => !nonempty(id)) ||
      record.revision !== record.appliedEventIds.length ||
      new Set(record.appliedEventIds).size !== record.appliedEventIds.length) {
    throw new Error("Invalid workflow revision history");
  }
  if (record.appliedEventIds.includes(event.eventId)) {
    // Never acknowledge a replay with different content or an older target stage.
    const targetIndex = template.stages.indexOf(record.stage);
    if (record.stage !== event.to || targetIndex < 1 ||
        template.stages[targetIndex - 1] !== event.from ||
        event.expectedRevision !== record.revision - 1 ||
        record.appliedEventIds[record.appliedEventIds.length - 1] !== event.eventId) {
      throw new Error("Conflicting workflow event replay");
    }
    return record;
  }
  if (record.revision !== event.expectedRevision) throw new Error("Stale workflow revision");
  const fromIndex = template.stages.indexOf(event.from);
  if (record.stage !== event.from || fromIndex < 0 || template.stages[fromIndex + 1] !== event.to) {
    throw new Error("Invalid industry workflow transition");
  }
  return {
    ...record,
    stage: event.to,
    revision: record.revision + 1,
    appliedEventIds: [...record.appliedEventIds, event.eventId],
  };
}
