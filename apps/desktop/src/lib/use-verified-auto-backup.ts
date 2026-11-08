import * as React from "react";
import {
  shouldRunAutoBackup, getAutoBackupSettings, recordBackupSuccess, recordBackupFailure,
} from "@minarvabiz/business-logic";
import { persistDomainToSqlite } from "./sqlite-bootstrap";

const RETRY_COOLDOWN_MS = 5 * 60_000;

/** Keep hourly recovery copies up to date while the desktop stays open.
 * Never copy a stale image while the renderer has outstanding writes.
 * A failed backup remains visible and is retried with a bounded cooldown.
 */
export function useVerifiedDesktopAutoBackup(
  ready: boolean,
  changeSerial: number,
  refreshAll: () => void,
): void {
  const active = React.useRef(false);
  const lastAttemptAt = React.useRef(0);

  const check = React.useCallback(async () => {
    const api = window.minarvaDesktop;
    if (!ready || !api?.createAutomaticBackup || active.current ||
        !shouldRunAutoBackup() ||
        Date.now() - lastAttemptAt.current < RETRY_COOLDOWN_MS) return;
    active.current = true;
    lastAttemptAt.current = Date.now();
    try {
      // A valid SQLite image is not necessarily the latest business state.
      if (!await persistDomainToSqlite()) {
        throw new Error("Pending business changes could not be saved to SQLite.");
      }
      const { retentionCount } = getAutoBackupSettings();
      const result = await api.createAutomaticBackup(retentionCount);
      if (!result.ok || !result.path) {
        throw new Error(result.error || "No verified automatic backup was produced.");
      }
      recordBackupSuccess(result.path, "auto", result.sizeBytes);
      if (!await persistDomainToSqlite()) {
        throw new Error("Backup succeeded, but backup metadata could not be saved.");
      }
    } catch (error) {
      recordBackupFailure(error instanceof Error ? error.message : String(error));
    } finally {
      active.current = false;
      refreshAll();
    }
  }, [ready, refreshAll]);

  React.useEffect(() => {
    if (!ready) return;
    // Native bootstrap also schedules an initial backup after durable startup.
    // Give that request the first opportunity to complete before rechecking.
    const startup = window.setTimeout(() => { void check(); }, 3_000);
    const periodic = window.setInterval(() => { void check(); }, 5 * 60_000);
    return () => { window.clearTimeout(startup); window.clearInterval(periodic); };
  }, [ready, check]);

  React.useEffect(() => {
    if (!ready) return;
    void check();
  }, [ready, changeSerial, check]);
}
