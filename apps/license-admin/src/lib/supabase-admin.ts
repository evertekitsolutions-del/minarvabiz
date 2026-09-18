export type AdminDbResult<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
};

export function adminDbConfig() {
  const base = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return base && key ? { base: `${base}/rest/v1`, key } : null;
}

export async function adminDbFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<AdminDbResult<T>> {
  const cfg = adminDbConfig();
  if (!cfg) return { ok: false, status: 503, data: null, error: "Supabase is not configured." };

  const headers = new Headers(init.headers);
  headers.set("apikey", cfg.key);
  headers.set("content-type", "application/json");
  if (cfg.key.startsWith("sb_secret_")) headers.delete("authorization");
  else headers.set("authorization", `Bearer ${cfg.key}`);

  try {
    const response = await fetch(`${cfg.base}${path}`, { ...init, headers, cache: "no-store" });
    const data = (await response.json().catch(() => null)) as T | null;
    const message =
      response.ok
        ? null
        : String(
            (data as { message?: string; error?: string; hint?: string } | null)?.message ||
              (data as { message?: string; error?: string; hint?: string } | null)?.error ||
              response.statusText ||
              "Database request failed",
          );
    return { ok: response.ok, status: response.status, data, error: message };
  } catch (error) {
    return {
      ok: false,
      status: 503,
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
