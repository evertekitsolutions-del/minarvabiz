import type { UnitOfWork } from "./repository";
import { createMemoryUnitOfWork } from "./adapters/memory";
import { createSupabaseUnitOfWork, supabaseConfigFromEnv, isSupabaseConfigured } from "./adapters/supabase";
import {
  createFileJsonUnitOfWork,
  createLocalStorageIO,
  type FileIO,
} from "./adapters/file-json";

export type EditionMode = "online" | "offline" | "hybrid" | "memory";

export interface CreateDbOptions {
  edition?: EditionMode;
  fileIO?: FileIO;
  accessToken?: string | null;
}

export async function createDatabase(options: CreateDbOptions = {}): Promise<UnitOfWork> {
  const edition = options.edition ?? (isSupabaseConfigured() ? "online" : "memory");

  if (edition === "memory") {
    return createMemoryUnitOfWork();
  }

  if (edition === "offline") {
    const io = options.fileIO ?? createLocalStorageIO();
    const uow = await createFileJsonUnitOfWork(io);
    return { ...uow, edition: "offline" };
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
