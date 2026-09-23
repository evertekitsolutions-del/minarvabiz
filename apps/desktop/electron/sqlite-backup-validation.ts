import * as fs from "fs";

type SqlJsResult = { columns: string[]; values: unknown[][] };
type SqlJsDatabase = { exec: (sql: string) => SqlJsResult[]; close: () => void };
type SqlJsStatic = { Database: new (data?: ArrayLike<number>) => SqlJsDatabase };

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    // Self-contained ASM build: safe for packaged Electron without a separate WASM asset.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const initSqlJs = require("sql.js/dist/sql-asm.js") as (config?: object) => Promise<SqlJsStatic>;
    sqlJsPromise = initSqlJs({});
  }
  return sqlJsPromise;
}

export const REQUIRED_MINARVA_BACKUP_TABLES = [
  "meta",
  "domain_kv",
  "customers",
  "products",
  "sales",
  "payments",
] as const;

function firstValue(results: SqlJsResult[]): unknown {
  return results[0]?.values?.[0]?.[0];
}

export async function minarvaBackupSchemaError(file: string): Promise<string | null> {
  let db: SqlJsDatabase | null = null;
  try {
    const SQL = await loadSqlJs();
    db = new SQL.Database(fs.readFileSync(file));

    const tableResults = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = new Set<string>();
    for (const result of tableResults) {
      const nameIndex = result.columns.indexOf("name");
      if (nameIndex < 0) continue;
      for (const row of result.values) {
        const value = row[nameIndex];
        if (typeof value === "string") tableNames.add(value);
      }
    }

    const missing = REQUIRED_MINARVA_BACKUP_TABLES.filter((table) => !tableNames.has(table));
    if (missing.length > 0) {
      return `Minarva Biz schema is missing required tables: ${missing.join(", ")}`;
    }

    const version = Number(firstValue(db.exec("SELECT value FROM meta WHERE key='schema_version' LIMIT 1")));
    if (!Number.isSafeInteger(version) || version < 1) {
      return "Minarva Biz schema version metadata is missing or invalid";
    }

    return null;
  } catch (error) {
    return `SQLite database could not be opened for Minarva Biz schema validation: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    try {
      db?.close();
    } catch {
      // Best-effort cleanup only.
    }
  }
}
