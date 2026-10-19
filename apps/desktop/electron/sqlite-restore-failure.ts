/**
 * Recover a failed native SQLite restore without deleting the last usable
 * image. A pre-restore backup is not a substitute for retaining live evidence.
 */
import * as fs from "node:fs";
import * as path from "node:path";

type Io = Pick<typeof fs, "existsSync" | "lstatSync" | "renameSync" | "unlinkSync">;

export type FailedRestoreContext = {
  target: string;
  rollback: string;
  stageDirectory: string;
  hadTarget: boolean;
  targetMoved: boolean;
  newImageInstalled: boolean;
};

export type FailedRestoreResolution = {
  priorStateRestored: boolean;
  rollbackError: string | null;
  keepJournal: boolean;
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Never unlink an installed image before proving an authentic prior image
 * exists, validating it, and reserving a private failed-image evidence path.
 * On failures preserve whichever image survived and keep the restore journal.
 */
export async function reconcileFailedSqliteRestore(
  state: FailedRestoreContext,
  validate: (filename: string) => Promise<string | null>,
  io: Io = fs,
): Promise<FailedRestoreResolution> {
  const { target, rollback, stageDirectory, hadTarget, targetMoved, newImageInstalled } = state;

  if (!targetMoved) {
    if (!hadTarget && newImageInstalled && io.existsSync(target)) {
      return {
        priorStateRestored: false,
        rollbackError: "Unverified restored image retained for manual recovery.",
        keepJournal: true,
      };
    }
    return { priorStateRestored: hadTarget ? io.existsSync(target) : !io.existsSync(target),
      rollbackError: null, keepJournal: false };
  }

  if (!io.existsSync(rollback)) {
    return { priorStateRestored: false,
      rollbackError: "Previous database image is missing; installed image preserved for manual recovery.",
      keepJournal: true };
  }

  try {
    const stat = io.lstatSync(rollback);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return { priorStateRestored: false, rollbackError: "Rollback image is not a regular file.", keepJournal: true };
    }
    const invalid = await validate(rollback);
    if (invalid) {
      return { priorStateRestored: false,
        rollbackError: "Rollback image failed validation: " + invalid + ". Installed image retained.",
        keepJournal: true };
    }
  } catch (error) {
    return { priorStateRestored: false,
      rollbackError: "Cannot verify rollback image: " + message(error) + ". Installed image retained.",
      keepJournal: true };
  }

  // This is a private, uniquely allocated stage directory. Do not reuse an
  // occupied evidence name or trust it as writable space without checking.
  const failedImage = path.join(stageDirectory, "failed-installed.db");
  let movedInstalled = false;
  try {
    if (io.existsSync(target)) {
      if (io.existsSync(failedImage)) throw new Error("Failed-image evidence path already exists");
      io.renameSync(target, failedImage);
      movedInstalled = true;
    }
    io.renameSync(rollback, target);
  } catch (error) {
    let rescueError = "";
    if (movedInstalled && !io.existsSync(target)) {
      try { io.renameSync(failedImage, target); }
      catch (rescue) { rescueError = " Unable to return installed image: " + message(rescue); }
    }
    return { priorStateRestored: false,
      rollbackError: "Rollback rename failed: " + message(error) + "." + rescueError,
      keepJournal: true };
  }

  try {
    const invalid = await validate(target);
    if (invalid) {
      return { priorStateRestored: false,
        rollbackError: "Previous database failed validation after rollback: " + invalid,
        keepJournal: true };
    }
  } catch (error) {
    return { priorStateRestored: false,
      rollbackError: "Cannot revalidate previous database: " + message(error),
      keepJournal: true };
  }

  if (movedInstalled) {
    try { io.unlinkSync(failedImage); }
    catch (error) {
      return { priorStateRestored: true,
        rollbackError: "Previous database restored, but failed-image evidence could not be removed: " + message(error),
        keepJournal: true };
    }
  }
  return { priorStateRestored: true, rollbackError: null, keepJournal: false };
}
