/**
 * Startup automatic backup must never turn a recoverable native IPC failure
 * into an unhandled rejection or claim that an unverified file is backed up.
 * The caller starts this only AFTER the first durable SQLite write succeeds.
 */
export type StartupBackupResult = {
  ok: boolean;
  path?: string;
  sizeBytes?: number;
  error?: string;
  cancelled?: boolean;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runStartupAutomaticBackup(
  create: () => Promise<StartupBackupResult>,
  onSuccess: (path: string, sizeBytes?: number) => void,
  onFailure: (message: string) => void,
): Promise<void> {
  // Recording failed backup telemetry must never itself crash the renderer.
  const reportFailure = (message: string): void => {
    try {
      onFailure(message);
    } catch (error) {
      console.error("[minarvabiz] Could not record automatic backup failure", error);
    }
  };

  let result: StartupBackupResult;
  try {
    result = await create();
  } catch (error) {
    reportFailure(errorMessage(error));
    return;
  }

  if (result.cancelled) return;
  if (!result.ok || !result.path) {
    reportFailure(result.error || "Automatic backup returned no verified file");
    return;
  }
  try {
    onSuccess(result.path, result.sizeBytes);
  } catch (error) {
    reportFailure("Automatic backup metadata could not be recorded: " + errorMessage(error));
  }
}
