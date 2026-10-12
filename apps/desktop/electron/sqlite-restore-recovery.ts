/**
 * Crash boundary for Windows SQLite restores. A journal is durable BEFORE
 * the two-rename swap. Startup never installs an unverified staged image or
 * overwrites a surviving live database. Stranded images are never auto-deleted.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { SqliteRestoreStage } from "./sqlite-restore-staging";

const PREFIX = ".minarva-restore-";
const JOURNAL = "restore-journal.json";
const VERSION = 1;
type RestoreJournal = { version: 1; targetName: string; hadTarget: boolean };
export type RestoreStartupResult = { ok: true; recovered: boolean; retainedWorkspaces: number } | { ok: false; error: string };

function journalPath(stage: SqliteRestoreStage): string { return path.join(stage.directory, JOURNAL); }

/** Must be called after exclusive staging, before *either* live-file rename. */
export function beginSqliteRestoreJournal(stage: SqliteRestoreStage, target: string): void {
  if (path.dirname(stage.directory) !== path.dirname(target) ||
      stage.rollback !== path.join(stage.directory, "rollback.db") ||
      stage.temp !== path.join(stage.directory, "staged.db") ||
      !path.basename(stage.directory).startsWith(PREFIX)) {
    throw new Error("Restore journal workspace is not next to the selected database");
  }
  const record: RestoreJournal = { version: VERSION, targetName: path.basename(target), hadTarget: fs.existsSync(target) };
  let fd: number | null = null;
  try {
    fd = fs.openSync(journalPath(stage), "wx", 0o600);
    fs.writeFileSync(fd, JSON.stringify(record), "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    // Metadata fsync is unavailable on some Windows filesystems.
    syncDirectoryBestEffort(stage.directory);
    syncDirectoryBestEffort(path.dirname(target));
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch {} }
  }
}

export function clearSqliteRestoreJournal(stage: SqliteRestoreStage): void {
  fs.unlinkSync(journalPath(stage));
  syncDirectoryBestEffort(stage.directory);
}

function syncDirectoryBestEffort(directory: string): void {
  let fd: number | null = null;
  try { fd = fs.openSync(directory, "r"); fs.fsyncSync(fd); }
  catch { /* Directory fsync is not available on some Windows filesystems. */ }
  finally { if (fd !== null) { try { fs.closeSync(fd); } catch {} } }
}

function journalForWorkspace(directory: string, target: string): RestoreJournal {
  const filename = path.join(directory, JOURNAL);
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 || stat.size === 0) throw new Error("journal file is not a valid regular file");
  const record: unknown = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (!record || typeof record !== "object" ||
      (record as RestoreJournal).version !== VERSION ||
      (record as RestoreJournal).targetName !== path.basename(target) ||
      typeof (record as RestoreJournal).hadTarget !== "boolean") throw new Error("journal target/version mismatch");
  return record as RestoreJournal;
}

/** Call BEFORE creating a renderer window or allowing any database IPC. */
export async function recoverSqliteRestoreAtStartup(
  target: string,
  validate: (filename: string) => Promise<string | null>,
): Promise<RestoreStartupResult> {
  const parent = path.dirname(target);
  if (!fs.existsSync(parent)) return { ok: true, recovered: false, retainedWorkspaces: 0 };
  let names: string[];
  try { names = fs.readdirSync(parent).filter((name) => name.startsWith(PREFIX)); }
  catch { return { ok: false, error: "Cannot inspect database restore workspaces" }; }
  if (names.length === 0) return { ok: true, recovered: false, retainedWorkspaces: 0 };

  // Inventory EVERY workspace before mutating the live database. Any legacy,
  // malformed or injected workspace fails closed; no recursive cleanup.
  const workspaces: Array<{ directory: string; rollback: string; journal: RestoreJournal }> = [];
  for (const name of names) {
    const directory = path.join(parent, name);
    try {
      const st = fs.lstatSync(directory);
      if (!st.isDirectory() || st.isSymbolicLink()) throw new Error("workspace is not a directory");
      const journal = journalForWorkspace(directory, target);
      const rollback = path.join(directory, "rollback.db");
      if (fs.existsSync(rollback)) {
        const rb = fs.lstatSync(rollback);
        if (!rb.isFile() || rb.isSymbolicLink()) throw new Error("rollback image is not a regular file");
      }
      workspaces.push({ directory, rollback, journal });
    } catch (error) {
      return { ok: false, error: `Unverified restore workspace ${name}: ${error instanceof Error ? error.message : String(error)}. Preserve files for manual recovery.` };
    }
  }
  if (workspaces.length > 1) return { ok: false, error: "Multiple unfinished restore workspaces; manual review required. No files changed." };

  const current = workspaces[0];
  if (fs.existsSync(target)) {
    const reason = await validate(target);
    if (reason) return { ok: false, error: `Live database failed restore-startup validation: ${reason}. No automatic overwrite is allowed.` };
    // An installed valid image may represent either old or new state:
    // preserve rollback evidence rather than guessing or deleting it.
    return { ok: true, recovered: false, retainedWorkspaces: 1 };
  }
  if (!current.journal.hadTarget || !fs.existsSync(current.rollback)) {
    return { ok: false, error: "Live database absent and no verified previous database image is available. Manual recovery required." };
  }
  const reason = await validate(current.rollback);
  if (reason) return { ok: false, error: `Rollback image failed Minarva validation: ${reason}. No files changed.` };
  try {
    // Target is absent, so we NEVER replace a surviving database.
    fs.renameSync(current.rollback, target);
    syncDirectoryBestEffort(parent);
    const after = await validate(target);
    if (after) return { ok: false, error: `Recovered live image failed post-rename validation: ${after}. Preserve workspace and database for manual review.` };
    return { ok: true, recovered: true, retainedWorkspaces: 1 };
  } catch (error) {
    return { ok: false, error: `Recovery rename failed: ${error instanceof Error ? error.message : String(error)}. No cleanup attempted.` };
  }
}
