/**
 * Browser-only recovery for a FRESH, EMPTY, non-hosted workspace.
 * Never runs for Supabase/Hybrid or native SQLite. This intentionally does
 * not claim to restore cloud tenants or an existing occupied company.
 */
import { inspectBrowserSnapshotForRecovery } from "./browser-snapshot-download";

export const BROWSER_RECOVERY_STORAGE_KEY = "minarvabiz-domain-v2";

export interface BrowserRecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BrowserRecoveryBoundary {
  cloudConfigured: boolean;
  nativeDesktop: boolean;
  authorized: boolean;
}
type Snapshot = Record<string, unknown>;
const collections = [
  "customers", "products", "categories", "sales", "payments", "orders",
  "measurements", "laundry", "expenses", "purchases", "suppliers",
  "expenseCategories", "staff", "assignments", "incentiveRules", "payouts",
  "returns", "audit", "notifications", "stockTransfers", "heldSales",
  "attendance", "shiftRules", "rosterSlots", "holidayRules", "outbox",
  "quotations", "cashSessions", "purchaseReturns", "dayEndCloses",
] as const;

function parseFullV15(text: string): Snapshot {
  const bytes = new TextEncoder().encode(text).byteLength;
  inspectBrowserSnapshotForRecovery(text, 15, bytes);
  const value = JSON.parse(text) as Snapshot;
  // Old and partial archives must not enter the version-15 write path.
  for (const key of ["warehouse", "procurement", "accounting", "phase10", "shopProfile", "taxConfig"]) {
    if (!value[key] || typeof value[key] !== "object" || Array.isArray(value[key])) {
      throw new Error("Recovery file is incomplete: " + key);
    }
  }
  if (!Array.isArray(value.outbox) || !Array.isArray(value.branches)) {
    throw new Error("Recovery file lacks complete branch/outbox state");
  }
  return value;
}

function countRows(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== "object") return 0;
  return Object.values(value as Record<string, unknown>).reduce<number>(
    (total, child) => total + countRows(child), 0,
  );
}

function assertEmptyDestination(value: Snapshot): void {
  for (const field of collections) {
    if (countRows(value[field]) !== 0) throw new Error("Current workspace contains " + field + " data");
  }
  for (const field of ["warehouse", "procurement", "accounting", "phase10", "recycleBin"]) {
    if (countRows(value[field]) !== 0) throw new Error("Current workspace contains " + field + " data");
  }
  const branches = value.branches;
  if (!Array.isArray(branches) || branches.length !== 1 ||
      (branches[0] as { id?: string })?.id !== "branch-hq" ||
      (value.activeBranchId != null && value.activeBranchId !== "branch-hq")) {
    throw new Error("Current workspace already has a business branch identity");
  }
  const profile = value.shopProfile as Record<string, unknown> | null;
  if (profile && (
    profile.shopName !== "Minarva Biz" ||
    Boolean(profile.legalName) || Boolean(profile.gstin) || Boolean(profile.documentCode)
  )) {
    throw new Error("Current workspace already has company identity");
  }
}

/** No imported data is applied unless every independent boundary passes. */
export function assertStandaloneEmptyWorkspaceRecovery(
  source: string,
  current: string,
  persisted: string | null,
  boundary: BrowserRecoveryBoundary,
): void {
  if (!boundary.authorized) throw new Error("Backup management permission is required");
  if (boundary.cloudConfigured || boundary.nativeDesktop) {
    throw new Error("JSON recovery is disabled for hosted, hybrid and native SQLite editions");
  }
  const incoming = parseFullV15(source);
  const before = parseFullV15(current);
  assertEmptyDestination(before);
  if (persisted !== null) {
    assertEmptyDestination(parseFullV15(persisted));
  }
  // Replay of pending/failed events in a new workspace could write another
  // tenant's records if the user later connects cloud sync.
  if ((incoming.outbox as Array<{ status?: string }>).some(
    (event) => event?.status !== "synced" && event?.status !== "discarded",
  )) {
    throw new Error("Snapshot has unsent sync events; use authorized device recovery");
  }
}

export function restoreEmptyLocalBrowserSnapshot(
  storage: BrowserRecoveryStorage,
  source: string,
  current: string,
  boundary: BrowserRecoveryBoundary,
  apply: (json: string) => { ok: boolean; error?: string },
): { ok: boolean; error?: string } {
  const previous = storage.getItem(BROWSER_RECOVERY_STORAGE_KEY);
  try {
    assertStandaloneEmptyWorkspaceRecovery(source, current, previous, boundary);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  // Storage is installed before hydration; the current shared-core importer
  // provides in-memory rollback. Restore the previous storage on any failure.
  try {
    storage.setItem(BROWSER_RECOVERY_STORAGE_KEY, source);
  } catch {
    return { ok: false, error: "Unable to persist the recovered workspace" };
  }
  try {
    const applied = apply(source);
    if (!applied.ok) throw new Error(applied.error || "Snapshot import failed");
    return { ok: true };
  } catch (error) {
    try {
      if (previous == null) storage.removeItem(BROWSER_RECOVERY_STORAGE_KEY);
      else storage.setItem(BROWSER_RECOVERY_STORAGE_KEY, previous);
    } catch {
      return { ok: false, error: "Recovery failed and storage rollback also failed; stop using this workspace" };
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
