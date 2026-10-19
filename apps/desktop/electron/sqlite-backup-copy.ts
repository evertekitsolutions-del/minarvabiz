/**
 * Windows native backup copy boundary. Refuse overwriting any existing
 * destination (including a symlink), even when the file picker selected it.
 * A customer can choose a different name instead of losing older backups.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

type Io = Pick<typeof fs, "mkdirSync" | "copyFileSync" | "statSync">;
type BackupKind = "manual" | "automatic" | "pre-restore" | "pre-update";

export function uniqueSqliteBackupFilename(kind: BackupKind, timestamp: string): string {
  return `minarvabiz-${kind}-${timestamp}-${randomUUID()}.db`;
}

/** Ownership begins ONLY after the exclusive copy returns successfully. */
export function copySqliteBackupExclusive(
  source: string,
  destination: string,
  io: Io = fs,
): number {
  if (path.resolve(source) === path.resolve(destination)) {
    throw new Error("Cannot overwrite the source backup file");
  }
  io.mkdirSync(path.dirname(destination), { recursive: true });
  io.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  return io.statSync(destination).size;
}

/** Actionable error for selecting an existing backup filename. */
export function sqliteBackupCopyError(error: unknown): string {
  if ((error as NodeJS.ErrnoException | null)?.code === "EEXIST") {
    return "A backup already exists at this location. Choose another filename; the existing backup was not changed.";
  }
  return error instanceof Error ? error.message : String(error);
}
