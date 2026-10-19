/**
 * Native Windows SQLite backup retention.
 *
 * Count only structurally verified Minarva Biz automatic backups. Corrupt,
 * unreadable and symlinked files must never displace recoverable backups from
 * the retention quota or be silently erased as a cleanup side effect.
 */
import * as fs from "node:fs";
import * as path from "node:path";

type Io = Pick<typeof fs, "readdirSync" | "lstatSync" | "unlinkSync">;
type Candidate = { file: string; mtimeMs: number; size: number };

export async function pruneVerifiedAutomaticBackups(
  directory: string,
  retention: number,
  verify: (file: string) => Promise<string | null>,
  io: Io = fs,
): Promise<{ pruned: number; retainedUnverified: number }> {
  const keep = Number.isFinite(retention)
    ? Math.max(1, Math.min(365, Math.floor(retention)))
    : 14;
  const valid: Candidate[] = [];
  let retainedUnverified = 0;

  for (const name of io.readdirSync(directory)) {
    if (!name.startsWith("minarvabiz-automatic-") || !name.endsWith(".db")) continue;
    const file = path.join(directory, name);
    try {
      const stat = io.lstatSync(file);
      // Never follow/delete symlinks, directories or mutable special files.
      if (!stat.isFile() || stat.isSymbolicLink() || !Number.isFinite(stat.mtimeMs)) {
        retainedUnverified++;
        continue;
      }
      if (await verify(file) !== null) {
        retainedUnverified++;
        continue;
      }
      valid.push({ file, mtimeMs: stat.mtimeMs, size: stat.size });
    } catch {
      // An unreadable file may be the only recoverable evidence. Keep it.
      retainedUnverified++;
    }
  }

  valid.sort((a, b) => b.mtimeMs - a.mtimeMs || a.file.localeCompare(b.file));
  let pruned = 0;
  for (const item of valid.slice(keep)) {
    try {
      const stat = io.lstatSync(item.file);
      // A file replaced or modified after enumeration is no longer ours to
      // prune without rechecking. A second validator run protects against
      // b-tree corruption or external writes in the meantime.
      if (!stat.isFile() || stat.isSymbolicLink() ||
          stat.mtimeMs !== item.mtimeMs || stat.size !== item.size ||
          await verify(item.file) !== null) continue;
      io.unlinkSync(item.file);
      pruned++;
    } catch {
      // Fail closed on verification or deletion errors; never delete blindly.
    }
  }
  return { pruned, retainedUnverified };
}
