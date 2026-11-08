/**
 * Call after any domain mutation to persist snapshot.
 * Desktop (Electron): primary write to SQLite via window hook.
 * Browser: localStorage snapshot only when not desktop and not production.
 */

import { isProductionMode } from "./runtime-mode";

export function touchPersistence() {
  if (typeof window === "undefined") return;
  try {
    const w = window as unknown as { __minarvaDesktopPersist?: () => void };
    if (typeof w.__minarvaDesktopPersist === "function") {
      w.__minarvaDesktopPersist();
      return;
    }
    if (isProductionMode()) return;
    void import("./persistence").then((m) => { m.scheduleAutoSave(600); });
  } catch (error) {
    // A synchronous desktop persistence failure must reach the domain mutation
    // so its optimistic state can be rolled back rather than falsely saved.
    throw error;
  }
}


/**
 * Explicit durable-write boundary for callers that need an acknowledged save.
 * Unlike touchPersistence(), this never falls back to a debounced browser
 * snapshot or treats a fire-and-forget desktop hook as a committed write.
 * The host must supply a Promise-returning adapter that resolves only after
 * its transaction is committed. Authentication and tenant scoping remain
 * responsibilities of the host adapter.
 */
export async function awaitDesktopPersistence(): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Durable persistence requires an authenticated desktop host.");
  }
  const host = window as unknown as {
    __minarvaDesktopPersist?: () => unknown;
  };
  if (typeof host.__minarvaDesktopPersist !== "function") {
    throw new Error("No durable desktop persistence adapter is available.");
  }
  const acknowledgement = host.__minarvaDesktopPersist();
  if (!acknowledgement || typeof (acknowledgement as PromiseLike<unknown>).then !== "function") {
    throw new Error("Desktop persistence adapter did not return a durable-write acknowledgement.");
  }
  await acknowledgement;
}
