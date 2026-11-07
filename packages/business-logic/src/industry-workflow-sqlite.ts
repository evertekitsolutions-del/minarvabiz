/**
 * Optional industry workflow SQLite adapter for a trusted Windows main process.
 * The host MUST resolve the authenticated actor/grants before invoking the port.
 * This module does not open a database in the renderer or modify shared ERP tables.
 * Apply INDUSTRY_WORKFLOW_SQLITE_SCHEMA inside the host's additive migration.
 */
import type { IndustryWorkflowCommitPort } from "./industry-workflow-commit";
import type { IndustryWorkflowRecord } from "./industry-workflow-reducer";

export const INDUSTRY_WORKFLOW_SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS industry_workflow_records (
  tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL, record_id TEXT NOT NULL,
  template_id TEXT NOT NULL, stage TEXT NOT NULL, revision INTEGER NOT NULL CHECK (revision >= 0),
  PRIMARY KEY (tenant_id, branch_id, record_id)
);
CREATE TABLE IF NOT EXISTS industry_workflow_events (
  tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL, record_id TEXT NOT NULL,
  event_id TEXT NOT NULL, actor_id TEXT NOT NULL,
  revision INTEGER NOT NULL, from_stage TEXT NOT NULL, to_stage TEXT NOT NULL,
  PRIMARY KEY (tenant_id, branch_id, record_id, event_id),
  UNIQUE (tenant_id, branch_id, record_id, revision),
  FOREIGN KEY (tenant_id, branch_id, record_id)
    REFERENCES industry_workflow_records (tenant_id, branch_id, record_id)
);
`;

type Statement = { get(...params: unknown[]): unknown; run(...params: unknown[]): unknown; all(...params: unknown[]): unknown };
export type IndustrySqliteDatabase = {
  prepare(sql: string): Statement;
  /** Synchronous SQLite transaction wrapper; MUST rollback on throw. */
  transaction<T>(callback: () => T): () => T;
};

type Row = { template_id: string; stage: string; revision: number };
type EventRow = { event_id: string };

/** Must only be called in a trusted process, with authenticated RBAC grants. */
export function createIndustrySqliteCommitPort(db: IndustrySqliteDatabase): IndustryWorkflowCommitPort {
  if (!db || typeof db.prepare !== "function" || typeof db.transaction !== "function") {
    throw new Error("Trusted SQLite transaction connection required");
  }
  return {
    async commit({ original, next, events, access }): Promise<IndustryWorkflowRecord> {
      // A direct port caller must not bypass the trusted host's scoped grants.
      // Browser preferences and successful UI preflight are not authorization.
      const validId = (value: unknown): value is string =>
        typeof value === "string" && value.trim().length > 0 && value.length <= 128;
      if (!access || !original || !next || !Array.isArray(events) ||
          !validId(access.actorId) || !validId(access.tenantId) ||
          !validId(access.branchId) || !validId(original.id) ||
          !validId(original.templateId) || !validId(original.stage) ||
          !Array.isArray(access.allowedTemplateIds) ||
          !Array.isArray(access.allowedTransitions) ||
          !access.allowedTemplateIds.includes(original.templateId) ||
          access.tenantId !== original.tenantId || access.branchId !== original.branchId ||
          next.tenantId !== original.tenantId || next.branchId !== original.branchId ||
          next.id !== original.id || next.templateId !== original.templateId ||
          events.length === 0 || events.length > 100) {
        throw new Error("Industry SQLite scope or authorization mismatch");
      }
      for (const event of events) {
        if (!event || !validId(event.eventId) || !validId(event.from) ||
            !validId(event.to) || event.tenantId !== access.tenantId ||
            event.branchId !== access.branchId ||
            !access.allowedTransitions.some(grant =>
              grant?.templateId === original.templateId &&
              grant.from === event.from && grant.to === event.to)) {
          throw new Error("Industry SQLite transition not authorized");
        }
      }
      // Reject malformed or unbounded revisions before opening a transaction.
      // SQLite INTEGER is signed 64-bit, but JS revision arithmetic must remain exact.
      if (!Number.isSafeInteger(original.revision) || original.revision < 0 ||
          !Number.isSafeInteger(next.revision) || next.revision < 0 ||
          !Array.isArray(original.appliedEventIds) ||
          !Array.isArray(next.appliedEventIds) ||
          original.appliedEventIds.length !== original.revision ||
          original.revision > Number.MAX_SAFE_INTEGER - events.length ||
          !events.every(event => Number.isSafeInteger(event.expectedRevision) &&
            event.expectedRevision >= 0)) {
        throw new Error("Industry SQLite invalid revision history");
      }
      // Never trust a direct port caller to have run the UI-side preflight.
      // Validate the entire event chain before any database statement executes.
      if (next.revision !== original.revision + events.length ||
          next.appliedEventIds.length !== original.appliedEventIds.length + events.length ||
          !original.appliedEventIds.every((id, index) => next.appliedEventIds[index] === id)) {
        throw new Error("Industry SQLite invalid revision history");
      }
      let expectedStage = original.stage;
      const seen = new Set(original.appliedEventIds);
      for (const [index, event] of events.entries()) {
        if (!event.eventId || seen.has(event.eventId) ||
            event.expectedRevision !== original.revision + index ||
            event.from !== expectedStage ||
            next.appliedEventIds[original.appliedEventIds.length + index] !== event.eventId) {
          throw new Error("Industry SQLite invalid event chain");
        }
        seen.add(event.eventId);
        expectedStage = event.to;
      }
      if (expectedStage !== next.stage) {
        throw new Error("Industry SQLite final stage mismatch");
      }
      const execute = db.transaction(() => {
        const key = [original.tenantId, original.branchId, original.id];
        const current = db.prepare(
          "SELECT template_id, stage, revision FROM industry_workflow_records WHERE tenant_id=? AND branch_id=? AND record_id=?"
        ).get(...key) as Row | undefined;
        if (!current) {
          if (original.revision !== 0 || original.appliedEventIds.length !== 0) {
            throw new Error("Industry SQLite record missing");
          }
          db.prepare("INSERT INTO industry_workflow_records (tenant_id, branch_id, record_id, template_id, stage, revision) VALUES (?,?,?,?,?,?)")
            .run(...key, original.templateId, original.stage, 0);
        } else if (current.template_id !== original.templateId ||
                   current.stage !== original.stage || current.revision !== original.revision) {
          throw new Error("Industry SQLite revision conflict");
        }
        // The adapter must not accept a fabricated history or acknowledge a duplicate.
        const history: string[] = [];
        for (let revision = 1; revision <= original.revision; revision++) {
          const found = db.prepare(
            "SELECT event_id FROM industry_workflow_events WHERE tenant_id=? AND branch_id=? AND record_id=? AND revision=?"
          ).get(...key, revision) as EventRow | undefined;
          if (!found) throw new Error("Industry SQLite event history incomplete");
          history.push(found.event_id);
        }
        if (history.length !== original.appliedEventIds.length ||
            history.some((id, i) => id !== original.appliedEventIds[i])) {
          throw new Error("Industry SQLite event history mismatch");
        }
        const insert = db.prepare(
          "INSERT INTO industry_workflow_events (tenant_id, branch_id, record_id, event_id, actor_id, revision, from_stage, to_stage) VALUES (?,?,?,?,?,?,?,?)"
        );
        for (const event of events) {
          if (event.tenantId !== original.tenantId || event.branchId !== original.branchId) {
            throw new Error("Industry SQLite event scope mismatch");
          }
          insert.run(...key, event.eventId, access.actorId, event.expectedRevision + 1, event.from, event.to);
        }
        const updated = db.prepare(
          "UPDATE industry_workflow_records SET stage=?, revision=? WHERE tenant_id=? AND branch_id=? AND record_id=? AND revision=?"
        ).run(next.stage, next.revision, ...key, original.revision) as { changes?: number };
        if (updated?.changes !== 1) throw new Error("Industry SQLite compare-and-swap conflict");
        return { ...next, appliedEventIds: [...next.appliedEventIds] };
      });
      return execute();
    },
  };
}
