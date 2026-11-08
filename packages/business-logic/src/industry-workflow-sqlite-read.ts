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
      !Array.isArray(access.allowedTemplateIds) ||
      access.allowedTemplateIds.some(template => !valid(template)) ||
      access.allowedTemplateIds.length > 100) {
    throw new Error("Trusted industry workflow read authorization required");
  }
  return db.transaction(() => {
    const key = [access.tenantId, access.branchId, recordId];
    const row = db.prepare(
      "SELECT template_id, stage, revision FROM industry_workflow_records WHERE tenant_id=? AND branch_id=? AND record_id=?"
    ).get(...key) as RecordRow | undefined;
    if (!row) return null;
    if (!valid(row.template_id) || !access.allowedTemplateIds.includes(row.template_id) ||
        !Number.isSafeInteger(row.revision) || row.revision < 0 || row.revision > 10000 || !valid(row.stage)) {
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

/**
 * Bounded branch-scoped workflow inbox for a trusted host.
 * Never expose unverified rows: each record is reloaded and replay-validated
 * through the same authenticated read boundary as a single-record lookup.
 * Cursor pagination is stable by record_id; callers must resolve grants anew.
 */
export function listIndustrySqliteWorkflows(
  db: IndustrySqliteDatabase,
  profile: IndustryWorkspaceProfile,
  access: IndustryWorkflowAccess,
  options: { afterId?: string; limit?: number } = {},
): { records: IndustryWorkflowRecord[]; nextCursor: string | null } {
  if (!db || typeof db.prepare !== "function" || typeof db.transaction !== "function" ||
      !access || !valid(access.actorId) || !valid(access.tenantId) ||
      !valid(access.branchId) || !Array.isArray(access.allowedTemplateIds)) {
    throw new Error("Trusted industry workflow list authorization required");
  }
  const limit = options.limit ?? 25;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 ||
      (options.afterId !== undefined && !valid(options.afterId))) {
    throw new Error("Invalid industry workflow pagination");
  }
  // Empty grants cannot expose workflow metadata, even to a scoped caller.
  const templates = [...new Set(access.allowedTemplateIds)];
  if (templates.some(template => !valid(template))) {
    throw new Error("Invalid industry workflow template grant");
  }
  // Bound SQL bind parameters even when a trusted grant resolver returns an unexpectedly large set.
  // Fail closed rather than risking a host-dependent SQLite variable-limit error.
  if (templates.length > 100) {
    throw new Error("Too many industry workflow template grants");
  }
  if (templates.length === 0) return { records: [], nextCursor: null };
  // Filter by authorized templates before pagination: inaccessible records must
  // neither block the inbox nor leak through cursors or page sizes.
  return db.transaction(() => {
    const rows = db.prepare(
      `SELECT record_id FROM industry_workflow_records WHERE tenant_id=? AND branch_id=? AND template_id IN (${templates.map(() => "?").join(",")}) AND record_id>? ORDER BY record_id LIMIT ?`
    ).all(access.tenantId, access.branchId, ...templates, options.afterId ?? "", limit + 1) as { record_id: string }[];
    if (!Array.isArray(rows) || rows.length > limit + 1 ||
        rows.some((row, index) => !row || !valid(row.record_id) ||
          (index > 0 && row.record_id <= rows[index - 1].record_id) ||
          (options.afterId !== undefined && row.record_id <= options.afterId))) {
      throw new Error("Industry workflow list corrupt records");
    }
    const selected = rows.slice(0, limit);
    const records = selected.map(row => {
      const record = readIndustrySqliteWorkflow(db, profile, access, row.record_id);
      if (!record) throw new Error("Industry workflow list changed during read");
      return record;
    });
    return { records, nextCursor: rows.length > limit ? selected[selected.length - 1].record_id : null };
  })();
}
