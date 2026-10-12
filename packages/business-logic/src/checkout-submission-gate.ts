/**
 * Synchronous first-customer checkout gate used by POS and Normal Billing.
 * A second click must not create a second invoice before React re-renders.
 * An exception is ambiguous: the sale might already be saved, so fail closed.
 * This guard is per component, not cross-device or server idempotency.
 */
export function createCheckoutSubmissionGate() {
  let state: "ready" | "running" | "saved" | "uncertain" = "ready";
  return {
    status() { return state; },
    submit<T extends { success: boolean }>(callback: () => T):
      | { status: "accepted"; result: T }
      | { status: "blocked"; reason: string } {
      if (state !== "ready") return { status: "blocked", reason: state };
      state = "running";
      try {
        const result = callback();
        state = result.success ? "saved" : "ready";
        return { status: "accepted", result };
      } catch (error) {
        state = "uncertain";
        throw error;
      }
    },
    beginNewCart() {
      if (state === "running") return false;
      state = "ready";
      return true;
    },
  };
}
