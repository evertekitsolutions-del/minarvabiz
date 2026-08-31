/**
 * Browser / Electron-renderer SQLite via sql.js (WASM).
 * File bytes are provided by caller IO (Electron IPC in desktop app).
 */

import { SQLITE_DDL, SQLITE_SCHEMA_VERSION } from "../sql/sqlite-ddl";

export interface BrowserSqliteFileIO {
  readFile(p: string): Uint8Array | null;
  writeFile(p: string, data: Uint8Array): void;
  exists(p: string): boolean;
  mkdirp(dir: string): void;
}

type SqlJsDb = {
  run: (sql: string, params?: unknown[]) => void;
  prepare: (sql: string) => {
    bind: (params: unknown[]) => void;
    step: () => boolean;
    getAsObject: () => Record<string, unknown>;
    free: () => void;
  };
  export: () => Uint8Array;
  close: () => void;
};

let SQL: { Database: new (data?: ArrayLike<number>) => SqlJsDb } | null = null;

async function loadSqlJs() {
  if (SQL) return SQL;
  const mod = await import("sql.js");
  const initSqlJs = (mod as { default?: unknown }).default ?? mod;
  SQL = await (initSqlJs as (cfg?: { locateFile?: (f: string) => string }) => Promise<typeof SQL>)({
    locateFile: (file: string) => {
      // Packaged with Vite base "./" — wasm copied to dist root / public
      if (typeof window !== "undefined") {
        return `./${file}`;
      }
      return file;
    },
  });
  return SQL!;
}

function rowsFromExec(db: SqlJsDb, sql: string, params: unknown[] = []): Record<string, unknown>[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const out: Record<string, unknown>[] = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

export interface SqliteDatabase {
  path: string;
  save: () => void;
  close: () => void;
  exec: (sql: string, params?: unknown[]) => void;
  query: (sql: string, params?: unknown[]) => Record<string, unknown>[];
  transaction: <T>(fn: () => T) => T;
}

export async function openSqliteDatabase(
  dbPath: string,
  io: BrowserSqliteFileIO
): Promise<SqliteDatabase> {
  const sqlJs = await loadSqlJs();
  io.mkdirp("");
  const existing = io.readFile(dbPath);
  const db = existing && existing.length > 0 ? new sqlJs.Database(existing) : new sqlJs.Database();
  db.run("PRAGMA foreign_keys = ON;");
  for (const s of SQLITE_DDL.split(";").map((x) => x.trim()).filter(Boolean)) {
    try {
      db.run(s);
    } catch {
      /* IF NOT EXISTS */
    }
  }
  try {
    db.run("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)", [
      "schema_version",
      String(SQLITE_SCHEMA_VERSION),
    ]);
  } catch {
    /* meta table may already exist */
  }

  const save = () => {
    io.writeFile(dbPath, db.export());
  };

  const api: SqliteDatabase = {
    path: dbPath,
    save,
    close() {
      save();
      db.close();
    },
    exec(sql, params = []) {
      db.run(sql, params);
    },
    query(sql, params = []) {
      return rowsFromExec(db, sql, params);
    },
    transaction<T>(fn: () => T): T {
      db.run("BEGIN");
      try {
        const result = fn();
        db.run("COMMIT");
        save();
        return result;
      } catch (e) {
        try {
          db.run("ROLLBACK");
        } catch {
          /* */
        }
        throw e;
      }
    },
  };
  save();
  return api;
}
