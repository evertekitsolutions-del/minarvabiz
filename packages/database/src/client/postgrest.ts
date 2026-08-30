/**
 * Lightweight Supabase PostgREST + Auth client (fetch-based).
 * No @supabase/supabase-js dependency — works in browser and Node.
 * Uses ANON key only in client; service role must stay server-side.
 */

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  /** Server only — never pass to browser bundles */
  serviceRoleKey?: string;
  accessToken?: string | null;
}

export interface PgResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

function restBase(cfg: SupabaseConfig) {
  return cfg.url.replace(/\/$/, "") + "/rest/v1";
}

function authBase(cfg: SupabaseConfig) {
  return cfg.url.replace(/\/$/, "") + "/auth/v1";
}

function headers(cfg: SupabaseConfig, prefer?: string): Record<string, string> {
  // Never use service-role key in browser/client bundles.
  const isBrowser = typeof window !== "undefined";
  const key = isBrowser ? cfg.anonKey : (cfg.serviceRoleKey || cfg.anonKey);
  const h: Record<string, string> = {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${cfg.accessToken || key}`,
    "Content-Type": "application/json",
  };
  if (prefer) h.Prefer = prefer;
  return h;
}

export async function pgSelect<T>(
  cfg: SupabaseConfig,
  table: string,
  query: string = "select=*"
): Promise<PgResult<T[]>> {
  try {
    const url = `${restBase(cfg)}/${table}?${query}`;
    const res = await fetch(url, { headers: headers(cfg) });
    if (!res.ok) {
      const body = await res.text();
      return { data: null, error: { message: body || res.statusText, code: String(res.status) } };
    }
    const data = (await res.json()) as T[];
    return { data, error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
}

export async function pgInsert<T>(
  cfg: SupabaseConfig,
  table: string,
  row: Record<string, unknown> | Record<string, unknown>[]
): Promise<PgResult<T[]>> {
  try {
    const res = await fetch(`${restBase(cfg)}/${table}`, {
      method: "POST",
      headers: headers(cfg, "return=representation"),
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const body = await res.text();
      return { data: null, error: { message: body || res.statusText, code: String(res.status) } };
    }
    const data = (await res.json()) as T[];
    return { data, error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
}

export async function pgUpdate<T>(
  cfg: SupabaseConfig,
  table: string,
  matchQuery: string,
  patch: Record<string, unknown>
): Promise<PgResult<T[]>> {
  try {
    const res = await fetch(`${restBase(cfg)}/${table}?${matchQuery}`, {
      method: "PATCH",
      headers: headers(cfg, "return=representation"),
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const body = await res.text();
      return { data: null, error: { message: body || res.statusText, code: String(res.status) } };
    }
    const data = (await res.json()) as T[];
    return { data, error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
}

export async function pgDelete(
  cfg: SupabaseConfig,
  table: string,
  matchQuery: string
): Promise<PgResult<null>> {
  try {
    const res = await fetch(`${restBase(cfg)}/${table}?${matchQuery}`, {
      method: "DELETE",
      headers: headers(cfg),
    });
    if (!res.ok) {
      const body = await res.text();
      return { data: null, error: { message: body || res.statusText, code: String(res.status) } };
    }
    return { data: null, error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
}

/** Supabase Auth — email/password */
export async function authSignIn(
  cfg: SupabaseConfig,
  email: string,
  password: string
): Promise<PgResult<{ access_token: string; user: { id: string; email?: string } }>> {
  try {
    const res = await fetch(`${authBase(cfg)}/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: cfg.anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json();
    if (!res.ok) {
      return { data: null, error: { message: body.error_description || body.msg || res.statusText } };
    }
    return {
      data: {
        access_token: body.access_token,
        user: { id: body.user?.id, email: body.user?.email },
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
}

export async function authSignUp(
  cfg: SupabaseConfig,
  email: string,
  password: string,
  fullName?: string
): Promise<PgResult<{ id: string }>> {
  try {
    const res = await fetch(`${authBase(cfg)}/signup`, {
      method: "POST",
      headers: {
        apikey: cfg.anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        data: { full_name: fullName || "" },
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      return { data: null, error: { message: body.error_description || body.msg || res.statusText } };
    }
    return { data: { id: body.id || body.user?.id }, error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
}

export function isSupabaseConfigured(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}
): boolean {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";
  if (!url || !key) return false;
  if (url.includes("your-project")) return false;
  if (key.includes("your-anon")) return false;
  return true;
}

export function configFromEnv(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}
): SupabaseConfig | null {
  if (!isSupabaseConfigured(env)) return null;
  return {
    url: (env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL)!,
    anonKey: (env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY)!,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}
