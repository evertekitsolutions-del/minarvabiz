/**
 * Retired legacy showcase reset, retained only to preserve compile-time callers.
 * Never alter a real customer database based on organization name or trial date.
 * Historical archives/marker files are evidence and must remain untouched.
 */
export type CustomerDemoResetResult =
  | { status: "skipped" | "already_applied" }
  | { status: "reset"; backupPath: string; archivedPath: string }
  | { status: "blocked"; error: string };

type TrialIdentity = { organizationName?: string; activatedAt?: string } | null;

const LEGACY_CUSTOMER = "ERA WARDROBE";
const ACTIVATION_START = Date.parse("2026-10-01T00:00:00.000Z");
const ACTIVATION_END = Date.parse("2026-11-05T00:00:00.000Z");

/** Read-only classification for forensic support; NOT authorization to reset. */
export function isLegacyShowcaseInstallation(trial: TrialIdentity): boolean {
  if (!trial) return false;
  const organization = String(trial.organizationName || "").trim().replace(/\s+/g, " ").toUpperCase();
  const activatedAt = Date.parse(String(trial.activatedAt || ""));
  return organization === LEGACY_CUSTOMER
    && Number.isFinite(activatedAt)
    && activatedAt >= ACTIVATION_START
    && activatedAt < ACTIVATION_END;
}

/** Permanently fail closed: no implicit customer data deletion, rename or backup pruning. */
export async function resetLegacyShowcaseBusinessData(input: {
  userDataDir: string;
  trial: TrialIdentity;
  backupDatabase: () => Promise<{ ok: boolean; path?: string; error?: string }>;
}): Promise<CustomerDemoResetResult> {
  if (!isLegacyShowcaseInstallation(input.trial)) return { status: "skipped" };
  return {
    status: "blocked",
    error: "Automatic demo database reset was retired to protect real customer inventory. Preserve all historical SQLite files and use a separately authorized, verified manual recovery procedure.",
  };
}
