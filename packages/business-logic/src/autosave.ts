/**
 * Call after any domain mutation to persist snapshot.
 * Desktop (Electron): primary write to SQLite via window hook.
 * Browser: localStorage snapshot only when not desktop.
 */

export function touchPersistence() {
  if (typeof window === "undefined") return;
  try {
    const w = window as unknown as { __minarvaDesktopPersist?: () => void };
    if (typeof w.__minarvaDesktopPersist === "function") {
      w.__minarvaDesktopPersist();
      return;
    }
    void import("./persistence").then((m) => {
      m.scheduleAutoSave(600);
    });
  } catch {
    /* ignore */
  }
}
