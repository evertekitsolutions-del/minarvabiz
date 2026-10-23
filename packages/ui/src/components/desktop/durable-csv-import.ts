/**
 * A-FIRST-CUSTOMER: exactly-once local creation on an uncertain SQLite write.
 * Reuses existing licensed, validated product/customer/supplier CSV engines.
 * A failed disk acknowledgment retains the *same* in-memory records and only
 * retries SQLite persistence; importing again must never duplicate masters.
 */
export type FirstCustomerCsvKind = "products" | "customers" | "suppliers";

export type CsvImportPreview = {
  rows: readonly unknown[];
  errors: string[];
};
export type CsvImportResult = {
  created: number;
  errors: string[];
};
export type DurableCsvImportResult = {
  ok: boolean;
  created?: number;
  error?: string;
};
type CsvEngines = Record<FirstCustomerCsvKind, {
  preview: (csv: string) => CsvImportPreview;
  apply: (csv: string) => CsvImportResult;
}>;

export function createDurableCsvImport(
  engines: CsvEngines,
  persist: () => Promise<boolean>,
) {
  let pending: { kind: FirstCustomerCsvKind; csv: string; created: number } | null = null;
  let locked = false;
  // Any uncertain domain mutation requires operator reconciliation, not a second apply().
  let reviewRequired = false;

  const reviewError = (): DurableCsvImportResult => ({
    ok: false,
    error: "The CSV import may have changed records before failing. Stop importing and reconcile existing records with a known-good backup. Do not retry this CSV until reviewed.",
  });

  const pendingError = (): DurableCsvImportResult => ({
    ok: false,
    error: "Previously imported records have not been confirmed in SQLite. Retry saving those existing records before importing any new CSV.",
  });

  async function savePending(): Promise<DurableCsvImportResult> {
    if (!pending) return { ok: false, error: "There are no unsaved CSV imports." };
    try {
      if (await persist() !== true) return {
        ok: false,
        error: "SQLite did not confirm the imported records. Retry saving; do not import the same file again.",
      };
      const created = pending.created;
      pending = null;
      return { ok: true, created };
    } catch (error) {
      return {
        ok: false,
        error: "SQLite save failed: " + (error instanceof Error ? error.message : String(error)) +
          ". Retry saving existing records; do not import the file again.",
      };
    }
  }

  return {
    hasPending(): boolean { return pending !== null; },
    requiresReview(): boolean { return reviewRequired; },
    pendingKind(): FirstCustomerCsvKind | null { return pending?.kind ?? null; },
    isBusy(): boolean { return locked; },
    preview(kind: FirstCustomerCsvKind, csv: string): CsvImportPreview {
      if (reviewRequired) return { rows: [], errors: [reviewError().error!] };
      if (locked || pending) return { rows: [], errors: [pendingError().error!] };
      if (!(kind in engines) || typeof csv !== "string") return { rows: [], errors: ["Invalid CSV import"] };
      return engines[kind].preview(csv);
    },
    async commit(kind: FirstCustomerCsvKind, csv: string): Promise<DurableCsvImportResult> {
      if (reviewRequired) return reviewError();
      if (locked || pending) return pendingError();
      if (!(kind in engines) || typeof csv !== "string" || !csv.trim()) return { ok: false, error: "Select a non-empty CSV file." };
      locked = true;
      try {
        // Mandatory second parse + existing role/plan/deduplication validation
        // happen inside the domain import engine at the moment of commitment.
        const applied = engines[kind].apply(csv);
        if (applied.errors.length || applied.created <= 0) {
          if (applied.created > 0) {
            // The engine reported partial mutation. Never let a later import duplicate it.
            reviewRequired = true;
            return { ok: false, error: (applied.errors.join("; ") || "Partial import") + ". " + reviewError().error };
          }
          // A failed rollback can report zero created while leaving uncertain state.
          if (applied.errors.some(error => /rollback failed|snapshot recovery also failed/i.test(error))) {
            reviewRequired = true;
            return { ok: false, error: applied.errors.join("; ") + ". " + reviewError().error };
          }
          return { ok: false, error: applied.errors.join("; ") || "No records were imported." };
        }
        pending = { kind, csv, created: applied.created };
        return await savePending();
      } catch (error) {
        // Domain throw can be partially committed. Lock the controller for
        // reconciliation; no second apply() is safe in this session.
        reviewRequired = true;
        return {
          ok: false,
          error: "Import was interrupted: " + (error instanceof Error ? error.message : String(error)) +
            ". " + reviewError().error,
        };
      } finally {
        locked = false;
      }
    },
    async retryPersist(): Promise<DurableCsvImportResult> {
      if (reviewRequired) return reviewError();
      if (locked) return pendingError();
      if (!pending) return { ok: false, error: "There are no unsaved CSV imports." };
      locked = true;
      try { return await savePending(); }
      finally { locked = false; }
    },
  };
}
