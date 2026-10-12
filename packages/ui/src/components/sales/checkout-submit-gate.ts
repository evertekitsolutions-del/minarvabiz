/**
 * Synchronous checkout latch, independent of React's batched state updates.
 * Keep it claimed after a successful sale until a new empty-cart render has
 * committed. A rejected checkout may be corrected and retried immediately.
 */
export function createCheckoutSubmitGate() {
  let claimed = false;
  return {
    tryStart(): boolean {
      if (claimed) return false;
      claimed = true;
      return true;
    },
    release(): void {
      claimed = false;
    },
    isClaimed(): boolean {
      return claimed;
    },
  };
}
