/**
 * Edition-aware database factory.
 */

import type { UnitOfWork } from "./repository";
import { createMemoryUnitOfWork } from "./adapters/memory";
import { createSupabaseUnitOfWork, supabaseConfigFromEnv } from "./adapters/supabase";
import {
  createFileJsonUnitOfWork,
  createLocalStorageIO,
  type FileIO,
} from "./adapters/file-json";

export type EditionMode = "online" | "offline" | "hybrid" | "memory";

export interface CreateDbOptions {
  edition?: EditionMode;
  /** Custom file IO for Electron main/preload path */
  fileIO?: FileIO;
}

/**
 * Create unit of work for the current edition.
 * - memory: tests / current web demo stores
 * - offline/hybrid without native sqlite: file-json or localStorage
 * - online: use memory bridge until Postgres drizzle adapter is deployed
 */
export async function createDatabase(options: CreateDbOptions = {}): Promise<UnitOfWork> {
  const edition = options.edition ?? "memory";

  if (edition === "memory") {
    return createMemoryUnitOfWork();
  }

  if (edition === "offline" || edition === "hybrid") {
    const io = options.fileIO ?? createLocalStorageIO();
    const uow = await createFileJsonUnitOfWork(io);
    return { ...uow, edition: edition === "hybrid" ? "hybrid" : "offline" };
  }

  // online — Supabase when configured, else memory bridge
  const cfg = supabaseConfigFromEnv();
  if (cfg) return createSupabaseUnitOfWork(cfg);
  return { ...createMemoryUnitOfWork(), edition: "online" };
}
