/**
 * Day-end close and reasoned reopen cannot be reported successful until
 * Electron acknowledges the SQLite image. Failed writes keep the original
 * in-memory mutation pending: retry ONLY persists, never repeats the action.
 */
export type DayEndRecord = { id: string; businessDate: string };
export type DayEndActionResult<T extends DayEndRecord> = { record: T | null; error?: string };
export type DurableDayEndResult<T extends DayEndRecord> = { ok: boolean; record?: T; error?: string };
type Pending<T extends DayEndRecord> = { kind: "close" | "reopen"; record: T };

export function createDurableDayEndController<T extends DayEndRecord>(
  closeDay: () => DayEndActionResult<T>,
  reopenDay: (date: string, reason: string) => DayEndActionResult<T>,
  persist: () => Promise<boolean>,
) {
  let pending: Pending<T> | null = null;
  let inFlight = false;
  const blocked = (): DurableDayEndResult<T> => ({
    ok: false,
    error: "An earlier day-end close/reopen is not confirmed in SQLite. Use Retry saving pending day-end before another operation.",
  });
  async function flush(): Promise<DurableDayEndResult<T>> {
    if (!pending) return { ok: false, error: "No unsaved day-end operation exists." };
    try {
      if (!await persist()) return {
        ok: false,
        error: "Native SQLite did not confirm the day-end change. The original operation is pending; retry saving without closing or reopening again.",
      };
      const record = pending.record;
      pending = null;
      return { ok: true, record };
    } catch (error) {
      return {
        ok: false,
        error: "Day-end SQLite save failed: " + (error instanceof Error ? error.message : String(error)) +
          ". The original operation is pending; retry saving without repeating it.",
      };
    }
  }
  async function mutate(
    kind: "close" | "reopen",
    callback: () => DayEndActionResult<T>,
  ): Promise<DurableDayEndResult<T>> {
    if (inFlight || pending) return blocked();
    inFlight = true;
    try {
      const result = callback();
      if (result.error || !result.record) {
        return { ok: false, error: result.error || "Day-end operation was rejected." };
      }
      pending = { kind, record: result.record };
      return await flush();
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      inFlight = false;
    }
  }
  return {
    hasPending(): boolean { return pending !== null; },
    pendingKind(): "close" | "reopen" | null { return pending?.kind ?? null; },
    isSaving(): boolean { return inFlight; },
    close(): Promise<DurableDayEndResult<T>> { return mutate("close", closeDay); },
    reopen(date: string, reason: string): Promise<DurableDayEndResult<T>> {
      return mutate("reopen", () => reopenDay(date, reason));
    },
    async retry(): Promise<DurableDayEndResult<T>> {
      if (inFlight) return blocked();
      if (!pending) return { ok: false, error: "No unsaved day-end operation exists." };
      inFlight = true;
      try { return await flush(); }
      finally { inFlight = false; }
    },
  };
}
