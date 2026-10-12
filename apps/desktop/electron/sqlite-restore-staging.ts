/** Exclusive on-volume restore workspace. This is not a recovery journal or OS writer lock. */
import * as fs from "node:fs";
import * as path from "node:path";

type Io = Pick<typeof fs, "mkdtempSync" | "copyFileSync" | "openSync" |
  "fsyncSync" | "closeSync" | "unlinkSync" | "rmdirSync">;
export type SqliteRestoreStage = { directory: string; temp: string; rollback: string };

/** Never recursively remove this directory: it may hold the only rollback image. */
export function cleanupSqliteRestoreStage(stage: SqliteRestoreStage, io: Io = fs): void {
  try { io.unlinkSync(stage.temp); } catch {}
  try { io.rmdirSync(stage.directory); } catch {}
}

export function prepareSqliteRestoreStage(source: string, target: string, io: Io = fs): SqliteRestoreStage {
  // mkdtemp atomically reserves a new directory, independent of clock/PID reuse.
  // Beside target, so subsequent renames stay on the same filesystem.
  const directory = io.mkdtempSync(path.join(path.dirname(target), ".minarva-restore-"));
  const stage = { directory, temp: path.join(directory, "staged.db"), rollback: path.join(directory, "rollback.db") };
  let fd: number | null = null;
  try {
    io.copyFileSync(source, stage.temp, fs.constants.COPYFILE_EXCL);
    fd = io.openSync(stage.temp, "r+");
    io.fsyncSync(fd);
    io.closeSync(fd);
    fd = null;
    return stage;
  } catch (error) {
    if (fd !== null) { try { io.closeSync(fd); } catch {} }
    cleanupSqliteRestoreStage(stage, io);
    throw error;
  }
}
