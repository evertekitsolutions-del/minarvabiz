import type { UnitOfWork } from "./repository";
import { createMemoryUnitOfWork } from "./adapters/memory";
import { createSupabaseUnitOfWork, supabaseConfigFromEnv, isSupabaseConfigured } from "./adapters/supabase";

export type EditionMode = "online" | "offline" | "hybrid" | "memory";

export interface CreateDbOptions {
  edition?: EditionMode;
  accessToken?: string | null;
  sqlitePath?: string;
}

export async function createDatabase(options: CreateDbOptions = {}): Promise<UnitOfWork> {
  const edition = options.edition ?? (isSupabaseConfigured() ? "online" : "memory");

  if (edition === "memory") {
    return createMemoryUnitOfWork();
  }

  if (edition === "offline") {
    const dbPath =
      options.sqlitePath ||
      (typeof process !== "undefined" ? process.env.MINARVA_SQLITE_PATH : "") ||
      "";
    if (dbPath && typeof window === "undefined") {
      const { openSqliteDatabase, createSqliteUnitOfWork, nodeFileIO } = await import(
        "./adapters/sqlite"
      );
      const sqlite = await openSqliteDatabase(dbPath, nodeFileIO());
      return createSqliteUnitOfWork(sqlite);
    }
    // Browser/offline callers must not silently fall back to localStorage.
    // The desktop runtime supplies SQLite; browser callers use memory mode explicitly.
    return createMemoryUnitOfWork();
  }

  if (edition === "online" || edition === "hybrid") {
    const cfg = supabaseConfigFromEnv();
    if (cfg && options.accessToken) cfg.accessToken = options.accessToken;
    const uow = await createSupabaseUnitOfWork(cfg);
    return { ...uow, edition: edition === "hybrid" ? "hybrid" : "online" };
  }

  return createMemoryUnitOfWork();
}

export { isSupabaseConfigured };
