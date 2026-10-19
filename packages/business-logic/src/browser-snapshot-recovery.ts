/**
 * Browser-only recovery for a FRESH, EMPTY, non-hosted workspace.
 * Never runs for Supabase/Hybrid or native SQLite. This intentionally does
 * not claim to restore cloud tenants or an existing occupied company.
 */
import { inspectBrowserSnapshotForRecovery } from "./browser-snapshot-download";
import { defaultPrintTemplates } from "./print-templates";

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


/**
 * A zero-transaction workspace may still contain a customer's setup work.
 * Snapshot restore replaces these settings; require their actual defaults,
 * ignoring only clock-generated updatedAt fields, before the first write.
 */
function sameJsonValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) &&
      a.length === b.length && a.every((item, index) => sameJsonValue(item, b[index]));
  }
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length &&
      keys.every((key) => Object.prototype.hasOwnProperty.call(right, key) &&
        sameJsonValue(left[key], right[key]));
  }
  return Object.is(a, b);
}

function assertDefaultSettings(
  actual: unknown,
  defaults: Record<string, unknown>,
  section: string,
): void {
  if (actual == null) return;
  if (typeof actual !== "object" || Array.isArray(actual)) {
    throw new Error("Current workspace has invalid " + section + " settings");
  }
  for (const [key, value] of Object.entries(actual)) {
    if (key === "updatedAt") continue;
    if (!Object.prototype.hasOwnProperty.call(defaults, key) ||
        !sameJsonValue(value, defaults[key])) {
      throw new Error("Current workspace already has " + section + " configuration");
    }
  }
}

function assertUnconfiguredWorkspace(value: Snapshot): void {
  const ids = value.onboardingCompletedIds;
  if (ids != null && (!Array.isArray(ids) || ids.length > 0)) {
    throw new Error("Current workspace has existing onboarding confirmations");
  }

  assertDefaultSettings(value.shopProfile, {
    shopName: "Minarva Biz", legalName: "", documentCode: "",
    address: "", addressLine2: "", district: "", state: "", country: "India",
    postalCode: "", phone: "", email: "", website: "", googleReviewUrl: "",
    gstin: "", receiptFooter: "Thank you for your business!", currency: "INR",
  }, "shop profile");

  assertDefaultSettings(value.taxConfig, {
    enableGst: true, gstin: "", defaultRatePercent: 5,
    rates: [
      { id: "tax-0", name: "Exempt", ratePercent: 0, isDefault: false },
      { id: "tax-5", name: "GST 5%", ratePercent: 5, isDefault: true },
      { id: "tax-12", name: "GST 12%", ratePercent: 12, isDefault: false },
      { id: "tax-18", name: "GST 18%", ratePercent: 18, isDefault: false },
    ],
  }, "tax");

  assertDefaultSettings(value.printSettings, {
    defaultInvoicePaper: "a4", thermalWidthMm: 80,
    a4PrinterName: "", thermalPrinterName: "", labelPrinterName: "",
    labelWidthMm: 50, labelHeightMm: 30, labelCodeMode: "both",
    silentDesktopPrint: false, templates: defaultPrintTemplates(),
  }, "print");

  const backups = value.autoBackup;
  if (backups != null) {
    if (typeof backups !== "object" || Array.isArray(backups)) {
      throw new Error("Current workspace has invalid backup settings");
    }
    const state = backups as Record<string, unknown>;
    if (Object.keys(state).some(key => key !== "settings" && key !== "history") ||
        (state.history != null && !sameJsonValue(state.history, []))) {
      throw new Error("Current workspace already has backup configuration");
    }
    assertDefaultSettings(state.settings, {
      enabled: true, intervalHours: 24, retentionCount: 14,
      destinationPath: "", lastBackupAt: null, lastBackupPath: null, lastError: null,
    }, "backup");
  }
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
  assertUnconfiguredWorkspace(value);
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
