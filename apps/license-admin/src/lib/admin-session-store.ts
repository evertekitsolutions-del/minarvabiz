import { randomUUID } from "node:crypto";
import {
  adminSessionTtlSeconds,
  type AdminIdentity,
  type AdminSessionClaims,
} from "./admin-session";
import { adminDbFetch } from "./supabase-admin";

export type AdminSessionAuthMethod = "totp" | "emergency";

type SessionRow = {
  id: string;
  actor_id: string;
  auth_user_id: string | null;
  actor_email: string;
  display_name: string;
  source: "supabase" | "emergency";
  auth_method: AdminSessionAuthMethod;
  expires_at: string;
  revoked_at: string | null;
};

type IdentityRow = {
  auth_user_id: string;
  email: string;
  display_name: string;
  status: "active" | "disabled";
};

export type RegisteredAdminSession =
  | { ok: true; sessionId: string; expiresAtMs: number }
  | { ok: false; error: string };

export async function registerAdminSession(
  identity: AdminIdentity,
  authMethod: AdminSessionAuthMethod,
  nowMs = Date.now(),
): Promise<RegisteredAdminSession> {
  const sessionId = randomUUID();
  const expiresAtMs = nowMs + adminSessionTtlSeconds(identity.source) * 1000;
  const authUserId = identity.source === "supabase" ? identity.id : null;
  const inserted = await adminDbFetch("/license_admin_sessions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      id: sessionId,
      actor_id: identity.id,
      auth_user_id: authUserId,
      actor_email: identity.email,
      display_name: identity.displayName,
      source: identity.source,
      auth_method: authMethod,
      expires_at: new Date(expiresAtMs).toISOString(),
    }),
  });
  if (!inserted.ok) {
    return { ok: false, error: "Administrator session registry is unavailable." };
  }
  return { ok: true, sessionId, expiresAtMs };
}

export async function validateRegisteredAdminSession(
  claims: AdminSessionClaims,
  nowMs = Date.now(),
): Promise<boolean> {
  const result = await adminDbFetch<SessionRow[]>(
    `/license_admin_sessions?select=id%2Cactor_id%2Cauth_user_id%2Cactor_email%2Cdisplay_name%2Csource%2Cauth_method%2Cexpires_at%2Crevoked_at&id=eq.${encodeURIComponent(claims.sessionId)}&limit=1`,
  );
  if (!result.ok) return false;
  const row = Array.isArray(result.data) ? result.data[0] : null;
  if (!row || row.revoked_at) return false;

  const expiresAtMs = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs || expiresAtMs !== claims.expiresAtMs) return false;
  if (
    row.actor_id !== claims.identity.id ||
    row.actor_email.trim().toLowerCase() !== claims.identity.email ||
    row.display_name !== claims.identity.displayName ||
    row.source !== claims.identity.source
  ) {
    return false;
  }
  if (row.source === "supabase" && row.auth_method !== "totp") return false;
  if (row.source === "emergency" && row.auth_method !== "emergency") return false;

  if (claims.identity.source === "supabase") {
    const identityResult = await adminDbFetch<IdentityRow[]>(
      `/license_admin_identities?select=auth_user_id%2Cemail%2Cdisplay_name%2Cstatus&auth_user_id=eq.${encodeURIComponent(claims.identity.id)}&limit=1`,
    );
    if (!identityResult.ok) return false;
    const identity = Array.isArray(identityResult.data) ? identityResult.data[0] : null;
    if (
      !identity ||
      identity.status !== "active" ||
      identity.email.trim().toLowerCase() !== claims.identity.email ||
      identity.display_name !== claims.identity.displayName
    ) {
      return false;
    }
  }

  return true;
}

export async function revokeRegisteredAdminSession(
  sessionId: string,
  reason = "logout",
): Promise<boolean> {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(sessionId || ""))) return false;
  const result = await adminDbFetch(
    `/license_admin_sessions?id=eq.${encodeURIComponent(sessionId)}&revoked_at=is.null`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        revoked_at: new Date().toISOString(),
        revoke_reason: String(reason || "revoked").slice(0, 120),
        last_seen_at: new Date().toISOString(),
      }),
    },
  );
  return result.ok;
}
