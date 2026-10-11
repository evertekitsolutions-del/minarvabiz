/**
 * Native Electron SQLite file-image commit boundary.
 *
 * Writes and fsyncs a UNIQUE same-directory staging file before validating it
 * and atomically replacing the live SQLite image. A rejected or interrupted
 * write before the rename cannot overwrite an existing customer database.
 * No schema/receipt/holiday authorization is added here.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

type Io = Pick<typeof fs,
  "mkdirSync" | "openSync" | "writeFileSync" | "fsyncSync" |
  "closeSync" | "renameSync" | "unlinkSync" | "existsSync"
>;

export function writeValidatedSqliteBinaryAtomically(
  file: string,
  bytes: Uint8Array,
  isValidStagedDatabase: (candidate: string) => boolean,
  io: Io = fs,
): boolean {
  if (!file || !(bytes instanceof Uint8Array) || bytes.byteLength === 0 ||
      typeof isValidStagedDatabase !== "function") return false;

  const directory = path.dirname(file);
  // Distinct IPC calls must NEVER reuse a timestamp-based staging filename.
  const temp = path.join(directory, "." + path.basename(file) +
    ".pending-" + process.pid + "-" + randomUUID());
  let renamed = false;
  let fd: number | null = null;
  try {
    io.mkdirSync(directory, { recursive: true });
    fd = io.openSync(temp, "wx", 0o600);
    io.writeFileSync(fd, bytes);
    io.fsyncSync(fd); // Persist entire new image before atomic switch.
    io.closeSync(fd);
    fd = null;
    if (!isValidStagedDatabase(temp)) return false;

    // Same-directory rename is the only point when live data changes.
    io.renameSync(temp, file);
    renamed = true;

    // On Windows some filesystems forbid fsync on directory handles.
    // This is a best-effort metadata barrier. Do not report a post-rename
    // failure as "not committed": after rename, the new image is LIVE.
    let directoryFd: number | null = null;
    try {
      directoryFd = io.openSync(directory, "r");
      io.fsyncSync(directoryFd);
    } catch {
      // Unsupported directory fsync: file contents were already fsynced;
      // Windows/FS power-loss durability still requires platform UAT.
    } finally {
      if (directoryFd !== null) {
        try { io.closeSync(directoryFd); } catch {}
      }
    }
    return true;
  } catch {
    return false;
  } finally {
    if (fd !== null) {
      try { io.closeSync(fd); } catch {}
    }
    if (!renamed) {
      try { if (io.existsSync(temp)) io.unlinkSync(temp); } catch {}
    }
  }
}
