/**
 * Mandatory SQLite bootstrap for Electron offline production.
 * Flow: UI → business-logic stores → SQLite file → outbox → Supabase
 */

import {
  setRuntimeMode,
  setOutboxDeviceId,
  exportDomainSnapshotFull,
  importDomainSnapshot,
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

export function isDesktopSqliteReady() {
  return ready;
}
export function getDesktopSqliteError() {
  return initError;
}

const SNAPSHOT_KEY = "domain_snapshot_v2";

function ensureKv(db: SqliteDatabase) {
  db.exec(`CREATE TABLE IF NOT EXISTS domain_kv (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
  );`);
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
  } catch {
    return null;
  }
}

export async function bootstrapDesktopSqlite(): Promise<{ ok: boolean; error?: string }> {
  try {
    setRuntimeMode("production");
    const deviceId = await api.getDeviceId?.();
    setOutboxDeviceId(deviceId || "desktop-win");

    const api = typeof window !== "undefined" ? window.minarvaDesktop : undefined;
    if (!api?.getSqlitePath || !api.readSqliteBinary || !api.writeSqliteBinary) {
      throw new Error(
        "Electron SQLite IPC missing. Offline production requires the Minarva Biz desktop shell."
      );
    }

    const dbPath = await api.getSqlitePath();
    const existing = await api.readSqliteBinary();
    const bytes =
      existing == null
        ? null
        : existing instanceof Uint8Array
          ? existing
          : new Uint8Array(existing as ArrayBuffer);

    const { openSqliteDatabase } = await import("../../../../packages/database/src/adapters/sqlite");

    let cached: Uint8Array | null = bytes;
    const io = {
      readFile: () => (cached ? Buffer.from(cached) : null),
      writeFile: (_p: string, data: Uint8Array) => {
        cached = data;
        void api.writeSqliteBinary(data);
      },
      exists: () => true,
      mkdirp: () => {},
    };

    const db = await openSqliteDatabase(dbPath, io);
    sqlite = db;

    const snap = loadSnap(db);
    if (snap) {
      importDomainSnapshot(snap as Parameters<typeof importDomainSnapshot>[0]);
    }

    ready = true;
    initError = null;

    // Register global persist hook for touchPersistence
    (window as unknown as { __minarvaDesktopPersist?: () => void }).__minarvaDesktopPersist =
      persistDomainToSqlite;

    persistDomainToSqlite();
    return { ok: true };
  } catch (e) {
    ready = false;
    initError = e instanceof Error ? e.message : String(e);
    console.error("[minarvabiz] FATAL SQLite init:", initError);
    return { ok: false, error: initError };
  }
}

export function persistDomainToSqlite() {
  if (!sqlite) {
    throw new Error("Cannot persist business data: SQLite not initialized");
  }
  const snap = exportDomainSnapshotFull();
  saveSnap(sqlite, snap);
  sqlite.save();
}
