/**
 * One-time customer-scoped migration for a legacy showcase installation.
 *
 * Customer requested a clean business workspace over the existing signed
 * in-app update channel. Never touch trial, device, license, or other userData.
 * Two separate, recoverable SQLite images are retained before a new blank
 * domain database may be initialized.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

export type CustomerDemoResetResult =
  | { status: "skipped" | "already_applied" }
  | { status: "reset"; backupPath: string; archivedPath: string }
  | { status: "blocked"; error: string };

type TrialIdentity = { organizationName?: string; activatedAt?: string } | null;

const CUSTOMER = "ERA WARDROBE";
const ACTIVATION_START = Date.parse("2026-10-01T00:00:00.000Z");
const ACTIVATION_END = Date.parse("2026-11-05T00:00:00.000Z");
const MARKER = "era-wardrobe-business-cleanup-v1.json";

export function isLegacyShowcaseInstallation(trial: TrialIdentity): boolean {
  if (!trial) return false;
  const organization = String(trial.organizationName || "").trim().replace(/\s+/g, " ").toUpperCase();
  const activatedAt = Date.parse(String(trial.activatedAt || ""));
  return organization === CUSTOMER
    && Number.isFinite(activatedAt)
    && activatedAt >= ACTIVATION_START
    && activatedAt < ACTIVATION_END;
}

export async function resetLegacyShowcaseBusinessData(input: {
  userDataDir: string;
  trial: TrialIdentity;
  backupDatabase: () => Promise<{ ok: boolean; path?: string; error?: string }>;
}): Promise<CustomerDemoResetResult> {
  // Do not reset future installations or unrelated customers.
  if (!isLegacyShowcaseInstallation(input.trial)) return { status: "skipped" };

  const marker = path.join(input.userDataDir, MARKER);
  if (fs.existsSync(marker)) return { status: "already_applied" };

  const database = path.join(input.userDataDir, "minarvabiz.db");
  if (!fs.existsSync(database)) return { status: "skipped" };

  // Backup and rename only a normal, existing SQLite file, never a symlink.
  const stat = fs.lstatSync(database);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    return { status: "blocked", error: "Customer database must be a regular file." };
  }

  let verifiedBackup: { ok: boolean; path?: string; error?: string };
  try {
    verifiedBackup = await input.backupDatabase();
  } catch (error) {
    return { status: "blocked", error: `Verified backup failed: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!verifiedBackup.ok || !verifiedBackup.path || !path.isAbsolute(verifiedBackup.path)
    || !fs.existsSync(verifiedBackup.path)) {
    return { status: "blocked", error: verifiedBackup.error || "No verified pre-cleanup SQLite backup is available." };
  }

  const retainedDir = path.join(input.userDataDir, "backups");
  fs.mkdirSync(retainedDir, { recursive: true });
  const archive = path.join(retainedDir,
    `minarvabiz-pre-update-era-wardrobe-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.db`);

  try {
    // A same-volume rename preserves the entire original image. No DELETE or
    // TRUNCATE is performed; the new app creates a blank SQLite image normally.
    fs.renameSync(database, archive);
  } catch (error) {
    return { status: "blocked", error: `Could not retain the original database: ${error instanceof Error ? error.message : String(error)}` };
  }

  try {
    fs.writeFileSync(marker, JSON.stringify({
      schema: "minarvabiz-customer-demo-reset-v1",
      completedAt: new Date().toISOString(),
      verifiedBackupPath: verifiedBackup.path,
      archivedOriginalPath: archive,
    }, null, 2), { encoding: "utf8", flag: "wx" });
  } catch (error) {
    // If the marker fails, undo the move before allowing the renderer to start.
    try {
      fs.renameSync(archive, database);
    } catch (rollbackError) {
      return { status: "blocked", error: `Cleanup marker failed and rollback requires support: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}` };
    }
    return { status: "blocked", error: `Cleanup marker failed: ${error instanceof Error ? error.message : String(error)}` };
  }

  return { status: "reset", backupPath: verifiedBackup.path, archivedPath: archive };
}
