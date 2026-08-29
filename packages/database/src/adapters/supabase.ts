/**
 * Supabase adapter skeleton — Online / Hybrid cloud.
 *
 * Install when deploying:
 *   pnpm add @supabase/supabase-js
 *
 * This module defines the client factory and repository shapes without
 * requiring the package at build time in low-resource CI.
 */

import type { UnitOfWork } from "../repository";
import { createMemoryUnitOfWork } from "./memory";

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  /** service role only on trusted servers — never in browser */
  serviceRoleKey?: string;
}

export type SupabaseClientLike = {
  from: (table: string) => {
    select: (cols?: string) => PromiseLike<{ data: unknown; error: unknown }>;
    insert: (row: unknown) => PromiseLike<{ data: unknown; error: unknown }>;
    update: (row: unknown) => PromiseLike<{ data: unknown; error: unknown }>;
  };
};

/**
 * Create a UnitOfWork backed by Supabase.
 * Until @supabase/supabase-js is installed, returns memory with edition=online
 * and logs a warning once.
 */
export async function createSupabaseUnitOfWork(
  _config: SupabaseConfig
): Promise<UnitOfWork> {
  if (typeof console !== "undefined") {
    console.info(
      "[minarvabiz] Supabase adapter: using memory bridge. Install @supabase/supabase-js and implement table mappers for production."
    );
  }
  return { ...createMemoryUnitOfWork(), edition: "online" };
}

/** Map env to config — safe for Next.js public anon key only in browser */
export function supabaseConfigFromEnv(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}
): SupabaseConfig | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return {
    url,
    anonKey,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}
