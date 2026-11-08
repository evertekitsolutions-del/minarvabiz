/**
 * Confirm a second, independently verified SQLite image after each successful
 * product Save. This is not governed by the daily/hourly background timer:
 * product entry must have an immediately recoverable on-disk checkpoint.
 */
import {
  getAutoBackupSettings,
  recordBackupFailure,
  recordBackupSuccess,
} from "@minarvabiz/business-logic";

type BackupResult = { ok: boolean; path?: string; sizeBytes?: number; error?: string };
type NativeBackupApi = {
  createAutomaticBackup?: (retention?: number) => Promise<BackupResult>;
};

export async function createProductRecoveryCheckpoint(
  api: NativeBackupApi | undefined,
): Promise<{ ok: boolean; error?: string }> {
  const fail = (reason: string) => {
    recordBackupFailure(reason);
    return { ok: false, error: reason };
  };
  if (!api?.createAutomaticBackup) {
    return fail("Verified product checkpoint unavailable: native backup service is missing.");
  }
  try {
    const retention = getAutoBackupSettings().retentionCount;
    // This copy is taken AFTER the product's native SQLite write returned true.
    // The native backup IPC validates the copied SQLite image and its schema.
    const result = await api.createAutomaticBackup(retention);
    if (!result.ok || !result.path) {
      return fail(result.error || "Verified product recovery checkpoint could not be created.");
    }
    recordBackupSuccess(result.path, "auto", result.sizeBytes);
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}
