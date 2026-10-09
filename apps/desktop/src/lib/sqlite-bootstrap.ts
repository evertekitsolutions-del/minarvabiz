/**
 * Mandatory SQLite bootstrap for Electron offline production.
 * Flow: UI -> business-logic stores -> SQLite file (via IPC) -> outbox
 */

import {
  setRuntimeMode,
  setOutboxDeviceId,
  exportDomainSnapshotFull,
  importDomainSnapshot,
  shouldRunAutoBackup,
  getAutoBackupSettings,
  recordBackupSuccess,
  recordBackupFailure,
} from "@minarvabiz/business-logic";

type SqliteDatabase = {
  save: () => void;
  exec: (sql: string, params?: unknown[]) => void;
  query: (sql: string, params?: unknown[]) => Record<string, unknown>[];
  transaction: <T>(fn: () => T) => T;
  path: string;
};

let sqlite: SqliteDatabase | null = null;
let ready = false;
let initError: string | null = null;
let integrityOk = false;
let integrityResult: string[] = [];
let pendingWrite: Promise<boolean> = Promise.resolve(true);
let newestBinary: Uint8Array | null = null;
let writeDrain: Promise<boolean> | null = null;
let scheduledPersist: ReturnType<typeof setTimeout> | null = null;

// Domain mutations may touch audit logs and outbox entries in the same UI action.
// Group the automatic notifications; explicit user saves still persist immediately.
function scheduleDomainPersistence(): void {
  if (scheduledPersist !== null) clearTimeout(scheduledPersist);
  scheduledPersist = setTimeout(() => {
    scheduledPersist = null;
    void persistDomainToSqlite().catch((error) => {
      console.error("[minarvabiz] SQLite automatic persistence failed", error);
    });
  }, 350);
}


export function isDesktopSqliteReady() {
  return ready;
}
export function getDesktopSqliteError() {
  return initError;
}
export function getDesktopSqliteIntegrity() {
  return { ok: integrityOk, result: [...integrityResult] };
}

const SNAPSHOT_KEY = "domain_snapshot_v2";

function ensureKv(db: SqliteDatabase) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS domain_kv (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
  );`
  );
}

function saveSnap(db: SqliteDatabase, snap: unknown) {
  ensureKv(db);
  const json = JSON.stringify(snap);
  db.transaction(() => {
    db.exec(`INSERT OR REPLACE INTO domain_kv (key, value, updated_at) VALUES (?, ?, ?)`, [
      SNAPSHOT_KEY,
      json,
      new Date().toISOString(),
    ]);
  });
}

function loadSnap(db: SqliteDatabase): unknown | null {
  ensureKv(db);
  const rows = db.query(`SELECT value FROM domain_kv WHERE key = ?`, [SNAPSHOT_KEY]);
  if (!rows[0]?.value) return null;
  try {
    return JSON.parse(String(rows[0].value));
  } catch (error) {
    // Corrupt persisted data must never be interpreted as a fresh installation:
    // doing so would overwrite the only recoverable snapshot on next save.
    throw new Error(`SQLite domain snapshot JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function checkSqliteIntegrity(db: SqliteDatabase): { ok: boolean; result: string[] } {
  try {
    const rows = db.query("PRAGMA quick_check");
    const result = rows.map((row) => String(row.quick_check ?? Object.values(row)[0] ?? "")).filter(Boolean);
    return { ok: result.length === 1 && result[0].toLowerCase() === "ok", result };
  } catch (error) {
    return { ok: false, result: [error instanceof Error ? error.message : String(error)] };
  }
}

let bootstrapPromise: Promise<{ ok: boolean; error?: string }> | null = null;

// React StrictMode mounts effects twice in development and packaged smoke builds.
// Concurrent bootstrap calls must never independently hydrate and persist snapshots:
// the second initializer can overwrite newer records with its stale initial read.
export function bootstrapDesktopSqlite(): Promise<{ ok: boolean; error?: string }> {
  if (!bootstrapPromise) bootstrapPromise = initializeDesktopSqlite();
  return bootstrapPromise;
}

async function initializeDesktopSqlite(): Promise<{ ok: boolean; error?: string }> {
  try {
    setRuntimeMode("production");

    const api = typeof window !== "undefined" ? window.minarvaDesktop : undefined;
    if (!api?.readSqliteBinary || !api.writeSqliteBinary) {
      throw new Error(
        "Electron SQLite IPC missing. Offline production requires the Minarva Biz desktop shell."
      );
    }

    const deviceId = (await api.getDeviceId?.()) || "desktop-win";
    setOutboxDeviceId(deviceId);

    const dbPath = "minarvabiz.db";
    const existing = await api.readSqliteBinary();
    const bytes: Uint8Array | null =
      existing == null
        ? null
        : existing instanceof Uint8Array
          ? existing
          : new Uint8Array(existing as ArrayBuffer);

    const { openSqliteDatabase } = await import("../../../../packages/database/src/adapters/sqlite-browser");

    let cached: Uint8Array | null = bytes;
    const io = {
      readFile: (_p: string): Uint8Array | null => cached,
      writeFile: (_p: string, data: Uint8Array) => {
        cached = data;
        // Snapshots are complete images of the domain. Bound native IPC memory to
        // one in-flight image and the newest queued image, not every intermediate one.
        newestBinary = data;
        if (!writeDrain) {
          const drain = async (): Promise<boolean> => {
            while (newestBinary) {
              const latest = newestBinary;
              newestBinary = null;
              // Never report a failed IPC write as successful; the caller can
              // retry a fresh complete snapshot without replacing the saved file.
              if (await api.writeSqliteBinary(latest) !== true) return false;
            }
            return true;
          };
          const operation = Promise.resolve().then(drain);
          writeDrain = operation;
          pendingWrite = operation.finally(() => { writeDrain = null; });
        }
      },
      exists: (_p: string) => cached != null && cached.length > 0,
      mkdirp: (_dir: string) => {
        /* main process creates dirs on writeBinary */
      },
    };

    const db = await openSqliteDatabase(dbPath, io);
    sqlite = db;

    const integrity = checkSqliteIntegrity(db);
    integrityOk = integrity.ok;
    integrityResult = integrity.result;
    if (!integrity.ok) {
      throw new Error(`SQLite integrity check failed for ${dbPath}: ${integrity.result.join(", ") || "unknown result"}`);
    }

    const snap = loadSnap(db);
    if (snap) {
      // Import reports validation/hydration failures as a result instead of throwing.
      // Never mark the database ready or overwrite a failed import with seeded data.
      const imported = importDomainSnapshot(snap as Parameters<typeof importDomainSnapshot>[0]);
      if (!imported.ok) {
        throw new Error(`SQLite domain snapshot restore failed: ${imported.error || "unknown import error"}`);
      }
    }

    ready = true;
    initError = null;

    try {
      if (shouldRunAutoBackup() && api.createAutomaticBackup) {
        void api.createAutomaticBackup(getAutoBackupSettings().retentionCount).then((result) => {
          if (result.ok && result.path) recordBackupSuccess(result.path, "auto", result.sizeBytes);
          else if (!result.cancelled) recordBackupFailure(result.error || "Automatic backup returned no verified file");
        });
      }
    } catch (e) {
      recordBackupFailure(e instanceof Error ? e.message : String(e));
    }

    (window as unknown as { __minarvaDesktopPersist?: () => void; __minarvaDesktopFlush?: () => Promise<boolean> }).__minarvaDesktopPersist =
      scheduleDomainPersistence;
    (window as unknown as { __minarvaDesktopFlush?: () => Promise<boolean> }).__minarvaDesktopFlush =
      flushDesktopSqlitePersistence;

    const persisted = await persistDomainToSqlite();
    if (!persisted) {
      throw new Error(`SQLite native persistence failed for ${dbPath}`);
    }
    return { ok: true };
  } catch (e) {
    ready = false;
    integrityOk = false;
    initError = e instanceof Error ? e.message : String(e);
    console.error("[minarvabiz] FATAL SQLite init:", initError);
    return { ok: false, error: initError };
  }
}

export async function persistDomainToSqlite(): Promise<boolean> {
  if (scheduledPersist !== null) {
    clearTimeout(scheduledPersist);
    scheduledPersist = null;
  }
  if (!sqlite) {
    throw new Error("Cannot persist business data: SQLite not initialized");
  }
  if (!integrityOk) {
    throw new Error("Cannot persist business data: SQLite integrity check is not healthy");
  }
  const snap = exportDomainSnapshotFull();
  // saveSnap commits through the adapter transaction, which already exports and queues
  // the SQLite binary. Exporting again here doubles peak ASM.js heap usage and IPC writes.
  saveSnap(sqlite, snap);
  return pendingWrite;
}

export async function flushDesktopSqlitePersistence(): Promise<boolean> {
  // A scheduled automatic mutation must not be lost when a consumer flushes.
  if (scheduledPersist !== null) return persistDomainToSqlite();
  return pendingWrite;
}
