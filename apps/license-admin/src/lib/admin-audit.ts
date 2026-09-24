import { randomUUID } from "node:crypto";
import type { AdminSessionClaims } from "./admin-session";
import { adminDbFetch } from "./supabase-admin";

export type AdminAuditOutcome = "attempted" | "success" | "denied" | "error";

function cleanText(value: unknown, max: number): string | null {
  if (value == null) return null;
  const cleaned = String(value).trim().slice(0, max);
  return cleaned || null;
}

function boundedDetails(details: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!details) return {};
  try {
    const encoded = JSON.stringify(details);
    if (encoded.length <= 12_000) return details;
    return { truncated: true, originalLength: encoded.length };
  } catch {
    return { serializationError: true };
  }
}

export async function recordAdminAudit(
  claims: AdminSessionClaims,
  action: string,
  outcome: AdminAuditOutcome,
  targetType?: string | null,
  targetId?: string | null,
  details?: Record<string, unknown>,
): Promise<boolean> {
  const safeAction = cleanText(action, 120);
  if (!safeAction) return false;

  const inserted = await adminDbFetch("/license_admin_audit_log", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      id: randomUUID(),
      session_id: claims.sessionId,
      actor_id: claims.identity.id,
      actor_email: claims.identity.email,
      display_name: claims.identity.displayName,
      actor_role: claims.identity.role,
      source: claims.identity.source,
      action: safeAction,
      outcome,
      target_type: cleanText(targetType, 80),
      target_id: cleanText(targetId, 200),
      details: boundedDetails(details),
    }),
  });
  return inserted.ok;
}
