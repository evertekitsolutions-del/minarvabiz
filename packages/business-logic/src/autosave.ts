/**
 * Call after any domain mutation to persist snapshot (browser only).
 */
import { scheduleAutoSave } from "./persistence";

export function touchPersistence() {
  try {
    scheduleAutoSave(600);
  } catch {
    /* ignore in SSR / non-browser */
  }
}
