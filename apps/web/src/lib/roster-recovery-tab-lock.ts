/**
 * HR-004B reviewed local recovery: same-origin browser-tab mutex.
 *
 * This lock covers BOTH authorized fresh Cloud/vault reads and the synchronous
 * local roster/outbox hydration. A competing tab must not perform another
 * reviewed restoration during that window. Never wait for a stale approval:
 * the manager must explicitly re-compare after a refusal.
 *
 * This is not a server transaction, a cross-device lock, or authority to
 * recover mixed IDs, retry outbox events or overwrite Cloud records.
 * Browser environments without Web Locks fail closed.
 */
const LOCK_NAME = "minarvabiz:hr004b:reviewed-local-restore";

export async function withExclusiveRosterRecoveryTabLock<T>(
  action: () => Promise<T>,
): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks?.request)
    throw new Error("Secure browser Web Locks are required for reviewed roster restoration; encrypted backup retained");
  return navigator.locks.request(
    LOCK_NAME, {mode:"exclusive",ifAvailable:true},
    async lock => {
      if (!lock)
        throw new Error("Another browser tab is reviewing roster restoration; retry with a fresh Cloud comparison");
      return action();
    },
  );
}
