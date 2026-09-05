import { NextResponse } from "next/server";
import { randomUUID, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
function db() { const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY; return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null; }
function authorized(request: Request) { const expected = String(process.env.LICENSE_API_SECRET || ""); const supplied = request.headers.get("x-license-admin-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || ""; if (!expected || !supplied) return false; const a = Buffer.from(expected); const b = Buffer.from(supplied); return a.length === b.length && timingSafeEqual(a, b); }

export async function PATCH(request: Request, context: { params: Promise<{ licenseId: string }> }) {
  if (!authorized(request)) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  const supabase = db(); if (!supabase) return NextResponse.json({ ok: false, code: "SERVICE_NOT_CONFIGURED" }, { status: 503 });
  const { licenseId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const status = body?.status;
  if (!["active", "suspended", "revoked", "deactivated"].includes(status)) return NextResponse.json({ ok: false, code: "INVALID_STATUS" }, { status: 400 });
  const { data: license } = await supabase.from("licenses").select("id,license_id,status").eq("license_id", licenseId).maybeSingle();
  if (!license) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  const { error } = await supabase.from("licenses").update({ status, updated_at: new Date().toISOString() }).eq("id", license.id);
  if (error) return NextResponse.json({ ok: false, code: "DATABASE_ERROR" }, { status: 500 });
  if (status !== "active") await supabase.from("license_activations").update({ status: "deactivated", deactivated_at: new Date().toISOString() }).eq("license_id", license.id).eq("status", "active");
  const eventType = status === "suspended" ? "suspended" : status === "revoked" ? "revoked" : status === "deactivated" ? "deactivated" : "validated";
  await supabase.from("license_events").insert({ id: randomUUID(), license_id: license.id, event_type: eventType, actor: "license-admin", details: { previousStatus: license.status, status } });
  return NextResponse.json({ ok: true, licenseId, previousStatus: license.status, status });
}
