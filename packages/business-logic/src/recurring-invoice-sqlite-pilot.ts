/**
 * SAL-007 opt-in SQLite recurrence pilot. Source-only, OFF in customer builds.
 * Owns draft schedules and pending-review queue, NOT an invoice/ledger writer.
 * Host must supply trusted tenant/branch authorisation, never a UI boolean.
 */
import {
  createRecurringInvoiceSchedule, planRecurringInvoiceDue,
  changeRecurringInvoiceStatus, type RecurringInvoiceInput,
  type RecurringInvoiceSchedule, type RecurringInvoiceOccurrence,
  type RecurringInvoiceStatus,
} from "./recurring-invoice";
import {
  prepareRecurringInvoiceCartPreview,
  type RecurringInvoiceCartPreview, type RecurringInvoiceVerifiedReaders,
} from "./recurring-invoice-checkout-preview";

export interface RecurringInvoiceSqliteDb {
  exec(sql: string, params?: unknown[]): void;
  query(sql: string, params?: unknown[]): Record<string, unknown>[];
  transaction<T>(fn: () => T): T;
}
export type AuthorizeRecurringInvoiceScope =
  (organizationId: string, companyId: string, branchId: string) => void;
export interface RecurringInvoiceScope {
  organizationId: string;
  companyId: string;
  branchId: string;
}
const validId = (x: unknown): x is string =>
  typeof x === "string" && x.length > 0 && x.length <= 128 &&
  x === x.trim() && !/[\u0000-\u001f]/.test(x);

function authorized(
  scope: RecurringInvoiceScope, authorize: AuthorizeRecurringInvoiceScope,
): void {
  if (!scope || !validId(scope.organizationId) ||
      !validId(scope.companyId) || !validId(scope.branchId) ||
      typeof authorize !== "function") {
    throw new Error("Trusted recurring invoice tenant/branch authorization is required");
  }
  authorize(scope.organizationId, scope.companyId, scope.branchId);
}
const changed = (db: RecurringInvoiceSqliteDb): number =>
  Number(db.query("SELECT changes() AS count")[0]?.count ?? -1);

/** Only invoked by an explicitly enabled trusted adapter; never from startup. */
export function initializeRecurringInvoicePilotSqlite(db: RecurringInvoiceSqliteDb): void {
  db.exec(`CREATE TABLE IF NOT EXISTS recurring_invoice_schedule_pilot_v1 (
    org_id TEXT NOT NULL, company_id TEXT NOT NULL, branch_id TEXT NOT NULL,
    id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','paused','cancelled')),
    version INTEGER NOT NULL CHECK(version > 0),
    payload_json TEXT NOT NULL CHECK(length(payload_json) BETWEEN 2 AND 32768),
    PRIMARY KEY(org_id, id)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS recurring_invoice_schedule_pilot_scope_v1
    ON recurring_invoice_schedule_pilot_v1(org_id, company_id, branch_id, status)`);
  db.exec(`CREATE TABLE IF NOT EXISTS recurring_invoice_draft_pilot_v1 (
    org_id TEXT NOT NULL, company_id TEXT NOT NULL, branch_id TEXT NOT NULL,
    id TEXT NOT NULL, schedule_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK(sequence > 0),
    due_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending_review'
      CHECK(status IN ('pending_review','posted')),
    posted_invoice_id TEXT, posted_at_utc TEXT, approved_by TEXT,
    CHECK(
      (status = 'pending_review' AND posted_invoice_id IS NULL
       AND posted_at_utc IS NULL AND approved_by IS NULL)
      OR
      (status = 'posted' AND posted_invoice_id IS NOT NULL
       AND posted_at_utc IS NOT NULL AND approved_by IS NOT NULL)
    ),
    PRIMARY KEY(org_id, id),
    UNIQUE(org_id, schedule_id, sequence),
    FOREIGN KEY(org_id, schedule_id) REFERENCES recurring_invoice_schedule_pilot_v1(org_id, id)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS recurring_invoice_draft_pilot_due_v1
    ON recurring_invoice_draft_pilot_v1(org_id, company_id, branch_id, due_date)`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS recurring_invoice_draft_pilot_posted_v1
    ON recurring_invoice_draft_pilot_v1(org_id, posted_invoice_id)
    WHERE posted_invoice_id IS NOT NULL`);
}

function loadSchedule(
  db: RecurringInvoiceSqliteDb, scope: RecurringInvoiceScope, scheduleId: string,
): RecurringInvoiceSchedule | null {
  if (!validId(scheduleId)) throw new Error("Invalid recurring invoice schedule ID");
  const rows = db.query(`SELECT payload_json, status, version
    FROM recurring_invoice_schedule_pilot_v1
    WHERE org_id=? AND company_id=? AND branch_id=? AND id=?`,
  [scope.organizationId, scope.companyId, scope.branchId, scheduleId]);
  if (!rows.length) return null;
  if (rows.length !== 1) throw new Error("Duplicated schedule storage row");
  let data: RecurringInvoiceSchedule;
  try { data = JSON.parse(String(rows[0].payload_json)) as RecurringInvoiceSchedule; }
  catch { throw new Error("Corrupt recurring invoice schedule JSON"); }
  if (!data || data.id !== scheduleId ||
      data.organizationId !== scope.organizationId ||
      data.companyId !== scope.companyId || data.branchId !== scope.branchId ||
      data.status !== rows[0].status || data.version !== rows[0].version) {
    throw new Error("Corrupt recurring invoice scope or schedule revision");
  }
  // This validates all persisted fields, not just the row's composite key.
  planRecurringInvoiceDue(data, data.firstDueDate, [], 1);
  return data;
}

export function saveRecurringInvoicePilotSqlite(
  db: RecurringInvoiceSqliteDb,
  input: RecurringInvoiceInput,
  authorize: AuthorizeRecurringInvoiceScope,
): { disposition: "created" | "existing"; schedule: RecurringInvoiceSchedule } {
  const schedule = createRecurringInvoiceSchedule(input);
  authorized(schedule, authorize);
  const payload = JSON.stringify(schedule);
  if (payload.length > 32768) throw new Error("Recurring invoice schedule too large");
  return db.transaction(() => {
    const existing = loadSchedule(db, schedule, schedule.id);
    if (existing) {
      if (JSON.stringify(existing) !== payload) {
        throw new Error("Recurring invoice ID already belongs to a different schedule");
      }
      return { disposition: "existing" as const, schedule: existing };
    }
    // Even a foreign branch reusing an organisation-level ID is rejected by PK.
    db.exec(`INSERT INTO recurring_invoice_schedule_pilot_v1
      (org_id,company_id,branch_id,id,status,version,payload_json)
      VALUES (?,?,?,?,?,?,?)`,
    [schedule.organizationId, schedule.companyId, schedule.branchId,
      schedule.id, schedule.status, schedule.version, payload]);
    if (changed(db) !== 1) throw new Error("Recurring invoice insert failed");
    return { disposition: "created" as const, schedule };
  });
}

export function changeRecurringInvoicePilotStatusSqlite(
  db: RecurringInvoiceSqliteDb, scope: RecurringInvoiceScope,
  scheduleId: string, version: number, next: RecurringInvoiceStatus,
  authorize: AuthorizeRecurringInvoiceScope,
): RecurringInvoiceSchedule {
  authorized(scope, authorize);
  return db.transaction(() => {
    const current = loadSchedule(db, scope, scheduleId);
    if (!current) throw new Error("Recurring invoice schedule does not exist");
    const updated = changeRecurringInvoiceStatus(current, version, next);
    if (updated === current) return current;
    db.exec(`UPDATE recurring_invoice_schedule_pilot_v1
      SET status=?, version=?, payload_json=?
      WHERE org_id=? AND company_id=? AND branch_id=? AND id=?
      AND status=? AND version=?`,
    [updated.status, updated.version, JSON.stringify(updated),
      scope.organizationId, scope.companyId, scope.branchId, scheduleId,
      current.status, current.version]);
    if (changed(db) !== 1) throw new Error("Recurring invoice schedule CAS conflict");
    return updated;
  });
}

/** Atomic manual-review staging; no sale, financial event or auto-send side effect. */
export function stageRecurringInvoiceDraftsPilotSqlite(
  db: RecurringInvoiceSqliteDb, scope: RecurringInvoiceScope,
  scheduleId: string, asOfDate: string,
  authorize: AuthorizeRecurringInvoiceScope,
): RecurringInvoiceOccurrence[] {
  authorized(scope, authorize);
  return db.transaction(() => {
    const current = loadSchedule(db, scope, scheduleId);
    if (!current) throw new Error("Recurring invoice schedule does not exist");
    const existingRows = db.query(`SELECT sequence FROM recurring_invoice_draft_pilot_v1
      WHERE org_id=? AND company_id=? AND branch_id=? AND schedule_id=?
      ORDER BY sequence`, [scope.organizationId, scope.companyId, scope.branchId, scheduleId]);
    const plans = planRecurringInvoiceDue(current, asOfDate,
      existingRows.map((row) => Number(row.sequence)));
    for (const item of plans) {
      db.exec(`INSERT INTO recurring_invoice_draft_pilot_v1
        (org_id,company_id,branch_id,id,schedule_id,sequence,due_date,status)
        VALUES (?,?,?,?,?,?,?,'pending_review')`,
      [item.organizationId, item.companyId, item.branchId, item.id,
        item.scheduleId, item.sequence, item.dueDate]);
      if (changed(db) !== 1) throw new Error("Recurring invoice draft staging conflict");
    }
    return plans;
  });
}

export function listRecurringInvoiceDraftsPilotSqlite(
  db: RecurringInvoiceSqliteDb, scope: RecurringInvoiceScope,
  authorize: AuthorizeRecurringInvoiceScope,
): RecurringInvoiceOccurrence[] {
  authorized(scope, authorize);
  return db.query(`SELECT id,schedule_id,sequence,due_date
    FROM recurring_invoice_draft_pilot_v1
    WHERE org_id=? AND company_id=? AND branch_id=? AND status='pending_review'
    ORDER BY due_date,schedule_id,sequence LIMIT 500`,
  [scope.organizationId, scope.companyId, scope.branchId]).map((row) => ({
    id: String(row.id), organizationId: scope.organizationId,
    companyId: scope.companyId, branchId: scope.branchId,
    scheduleId: String(row.schedule_id),
    sequence: Number(row.sequence), dueDate: String(row.due_date),
    kind: "invoice_draft_pending_review" as const,
  }));
}

/**
 * Pulls the review candidate directly from scoped, persisted pending drafts.
 * Renderer data cannot substitute a different occurrence or a different
 * schedule. Trusted host readers MUST resolve only authorised live records;
 * no asynchronous/network callbacks or ledger mutation are permitted here.
 */
export function previewRecurringInvoiceDraftPilotSqlite(
  db: RecurringInvoiceSqliteDb,
  scope: RecurringInvoiceScope,
  draftId: string,
  businessDate: string,
  authorize: AuthorizeRecurringInvoiceScope,
  live: Omit<RecurringInvoiceVerifiedReaders, "authorize">,
): RecurringInvoiceCartPreview {
  authorized(scope, authorize);
  if (!validId(draftId) || !live ||
      typeof live.getSourceSale !== "function" ||
      typeof live.getCustomer !== "function" ||
      typeof live.getProduct !== "function") {
    throw new Error("Trusted pending recurring draft and host readers are required");
  }
  return db.transaction(() => {
    const drafts = db.query(`SELECT id, schedule_id, sequence, due_date
      FROM recurring_invoice_draft_pilot_v1
      WHERE org_id=? AND company_id=? AND branch_id=? AND id=?
        AND status='pending_review'`,
    [scope.organizationId, scope.companyId, scope.branchId, draftId]);
    if (drafts.length !== 1) throw new Error("Pending recurring invoice draft not found in this branch");
    const row = drafts[0];
    const schedule = loadSchedule(db, scope, String(row.schedule_id));
    if (!schedule) throw new Error("Recurring invoice schedule missing for draft");
    return prepareRecurringInvoiceCartPreview(schedule, {
      id: String(row.id), scheduleId: String(row.schedule_id),
      organizationId: scope.organizationId,
      companyId: scope.companyId, branchId: scope.branchId,
      sequence: Number(row.sequence), dueDate: String(row.due_date),
      kind: "invoice_draft_pending_review",
    }, businessDate, { ...live, authorize });
  });
}

export interface RecurringInvoicePostPilotInput extends RecurringInvoiceScope {
  readonly draftId: string;
  readonly businessDate: string;
  /** Trusted host permission must include invoice creation/approval. */
  readonly authorizeApproval: AuthorizeRecurringInvoiceScope;
  readonly live: Omit<RecurringInvoiceVerifiedReaders, "authorize">;
  /** Current authenticated reviewer identity; NEVER from a form field. */
  readonly getAuthenticatedApproverId: () => string;
  /**
   * Host-owned synchronous financial writer. Must atomically insert the
   * existing authoritative sale + stock + ledger + outbox rows in this
   * transaction. Do not use network, promise or unrelated SQLite databases.
   */
  readonly postFinancialInvoice: (
    db: RecurringInvoiceSqliteDb,
    preview: RecurringInvoiceCartPreview,
    idempotencyKey: string,
  ) => { invoiceId: string };
  /** Independent host-owned SELECT on the authoritative invoice/ledger rows. */
  readonly verifyPostedInvoice: (
    db: RecurringInvoiceSqliteDb,
    invoiceId: string,
    preview: RecurringInvoiceCartPreview,
    idempotencyKey: string,
  ) => boolean;
}
export interface RecurringInvoicePostPilotResult {
  readonly disposition: "posted" | "already_posted";
  readonly draftId: string;
  readonly invoiceId: string;
}

/**
 * Production host integration point, NOT an enabled financial implementation.
 * All callbacks must be trusted host-owned synchronously executable SQL.
 * A callback passing a mock/no-op must never mark a recurring draft posted.
 */
export function postRecurringInvoiceDraftPilotSqlite(
  db: RecurringInvoiceSqliteDb,
  input: RecurringInvoicePostPilotInput,
): RecurringInvoicePostPilotResult {
  if (!input || typeof input.getAuthenticatedApproverId !== "function" ||
      typeof input.postFinancialInvoice !== "function" ||
      typeof input.verifyPostedInvoice !== "function" ||
      !validId(input.draftId)) {
    throw new Error("Recurring invoice posting requires trusted checkout authority");
  }
  authorized(input, input.authorizeApproval);
  const approverId = input.getAuthenticatedApproverId();
  if (!validId(approverId)) throw new Error("Missing authenticated invoice approver");
  return db.transaction(() => {
    const rows = db.query(`SELECT id,schedule_id,sequence,due_date,status,
      posted_invoice_id FROM recurring_invoice_draft_pilot_v1
      WHERE org_id=? AND company_id=? AND branch_id=? AND id=?`,
    [input.organizationId, input.companyId, input.branchId, input.draftId]);
    if (rows.length !== 1) throw new Error("Recurring invoice draft is absent or out of branch scope");
    const row = rows[0];
    if (row.status === "posted") {
      if (!validId(row.posted_invoice_id)) throw new Error("Corrupt posted recurring invoice");
      return {
        disposition: "already_posted" as const,
        draftId: input.draftId, invoiceId: row.posted_invoice_id,
      };
    }
    if (row.status !== "pending_review") throw new Error("Recurring invoice draft is not pending review");
    const schedule = loadSchedule(db, input, String(row.schedule_id));
    if (!schedule) throw new Error("Recurring invoice source schedule no longer exists");
    const preview = prepareRecurringInvoiceCartPreview(schedule, {
      id: String(row.id), organizationId: input.organizationId,
      companyId: input.companyId, branchId: input.branchId,
      scheduleId: String(row.schedule_id), sequence: Number(row.sequence),
      dueDate: String(row.due_date), kind: "invoice_draft_pending_review",
    }, input.businessDate, { ...input.live, authorize: input.authorizeApproval });
    const key = [input.organizationId, input.companyId, input.branchId,
      input.draftId].join(":");
    const before = Number(db.query("SELECT total_changes() AS count")[0]?.count);
    const proof = input.postFinancialInvoice(db, preview, key);
    if (!proof || typeof proof !== "object" || "then" in proof ||
        !validId(proof.invoiceId)) {
      throw new Error("Financial writer must return a synchronous persisted invoice identity");
    }
    const after = Number(db.query("SELECT total_changes() AS count")[0]?.count);
    if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after) || after <= before) {
      throw new Error("Financial writer did not persist an invoice transaction");
    }
    if (input.verifyPostedInvoice(db, proof.invoiceId, preview, key) !== true) {
      throw new Error("Financial invoice was not independently verified in the transaction");
    }
    const utc = new Date().toISOString();
    db.exec(`UPDATE recurring_invoice_draft_pilot_v1
      SET status='posted',posted_invoice_id=?,posted_at_utc=?,approved_by=?
      WHERE org_id=? AND company_id=? AND branch_id=? AND id=?
        AND schedule_id=? AND sequence=? AND status='pending_review'
        AND posted_invoice_id IS NULL`,
    [proof.invoiceId, utc, approverId,
      input.organizationId, input.companyId, input.branchId, input.draftId,
      String(row.schedule_id), Number(row.sequence)]);
    if (changed(db) !== 1) throw new Error("Recurring invoice final CAS conflict");
    return { disposition: "posted" as const,
      draftId: input.draftId, invoiceId: proof.invoiceId };
  });
}

/**
 * Lists schedules by trusted tenant/company/branch scope only. Invalid backing
 * JSON fails the ENTIRE list (never silently hides a damaged subscription).
 * A client may use this to render a workflow only after the host enables it.
 */
export function listRecurringInvoiceSchedulesPilotSqlite(
  db: RecurringInvoiceSqliteDb,
  scope: RecurringInvoiceScope,
  authorize: AuthorizeRecurringInvoiceScope,
): RecurringInvoiceSchedule[] {
  authorized(scope, authorize);
  return db.transaction(() => {
    const ids = db.query(`SELECT id FROM recurring_invoice_schedule_pilot_v1
      WHERE org_id=? AND company_id=? AND branch_id=?
      ORDER BY id LIMIT 501`,
    [scope.organizationId, scope.companyId, scope.branchId]);
    if (ids.length > 500) throw new Error("Recurring invoice schedule display limit exceeded");
    return ids.map((item) => {
      const record = loadSchedule(db, scope, String(item.id));
      if (!record) throw new Error("Recurring invoice schedule disappeared during read");
      return record;
    });
  });
}
