/**
 * Trusted-host read path for optional industry workflow records.
 * The host resolves authenticated grants; renderer-supplied scopes are not trusted.
 * Reads the snapshot and ordered event log under one SQLite transaction.
 */
import type { IndustrySqliteDatabase } from "./industry-workflow-sqlite";
import type { IndustryWorkflowAccess } from "./industry-workflow-access";
import type { IndustryWorkspaceProfile } from "./industry-workspace-profile";
import { replayIndustryWorkflowEvents, type IndustryWorkflowRecord, type IndustryWorkflowEvent } from "./industry-workflow-reducer";

type RecordRow = { template_id: string; stage: string; revision: number };
type EventRow = { event_id: string; revision: number; from_stage: string; to_stage: string; actor_id: string };
const valid = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 128;

/**
 * Returns null only when the scoped record does not exist. Missing or forged
 * history, unknown templates, or unauthorized access fail closed.
 */
export function readIndustrySqliteWorkflow(
  db: IndustrySqliteDatabase,
  profile: IndustryWorkspaceProfile,
  access: IndustryWorkflowAccess,
  recordId: string,
): IndustryWorkflowRecord | null {
  if (!db || typeof db.prepare !== "function" || typeof db.transaction !== "function" ||
      !access || !valid(access.actorId) || !valid(access.tenantId) ||
      !valid(access.branchId) || !valid(recordId) ||
      !Array.isArray(access.allowedTemplateIds)) {
    throw new Error("Trusted industry workflow read authorization required");
  }
  return db.transaction(() => {
    const key = [access.tenantId, access.branchId, recordId];
    const row = db.prepare(
      "SELECT template_id, stage, revision FROM industry_workflow_records WHERE tenant_id=? AND branch_id=? AND record_id=?"
    ).get(...key) as RecordRow | undefined;
    if (!row) return null;
    if (!valid(row.template_id) || !access.allowedTemplateIds.includes(row.template_id) ||
        !Number.isSafeInteger(row.revision) || row.revision < 0 || !valid(row.stage)) {
      throw new Error("Industry workflow read denied or corrupt record");
    }
    const events: IndustryWorkflowEvent[] = [];
    const seen = new Set<string>();
    for (let revision = 1; revision <= row.revision; revision++) {
      const event = db.prepare(
        "SELECT event_id, revision, from_stage, to_stage, actor_id FROM industry_workflow_events WHERE tenant_id=? AND branch_id=? AND record_id=? AND revision=?"
      ).get(...key, revision) as EventRow | undefined;
      if (!event || !valid(event.event_id) || !valid(event.actor_id) ||
          event.revision !== revision || seen.has(event.event_id)) {
        throw new Error("Industry workflow read corrupt event history");
      }
      seen.add(event.event_id);
      events.push({
        eventId: event.event_id, tenantId: access.tenantId, branchId: access.branchId,
        expectedRevision: revision - 1, from: event.from_stage, to: event.to_stage,
      });
    }
    const rebuilt = replayIndustryWorkflowEvents(profile, {
      id: recordId, tenantId: access.tenantId, branchId: access.branchId, templateId: row.template_id,
    }, events);
    if (rebuilt.stage !== row.stage || rebuilt.revision !== row.revision) {
      throw new Error("Industry workflow read snapshot mismatch");
    }
    return rebuilt;
  })();
}
