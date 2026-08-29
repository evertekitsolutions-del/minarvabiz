/**
 * Call after any domain mutation to persist snapshot (browser only).
 * Uses dynamic import to avoid circular dependency with store/persistence.
 */

export function touchPersistence() {
  if (typeof window === "undefined") return;
  try {
    // Dynamic import breaks store → autosave → persistence → store cycle
    void import("./persistence").then((m) => {
      m.scheduleAutoSave(600);
    });
  } catch {
    /* ignore */
  }
}
