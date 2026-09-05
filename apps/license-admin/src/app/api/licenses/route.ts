import { NextResponse } from "next/server";
import { createHash, randomUUID, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { issueLicense, PLAN_LIMITS, type LicensePlan } from "@minarvabiz/licensing";
import type { Edition } from "@minarvabiz/types";

export const runtime = "nodejs";
const PLANS: LicensePlan[] = ["trial", "basic", "professional", "business", "enterprise"];
const EDITIONS: Edition[] = ["online", "offline", "hybrid"];

function db() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}
function authorized(request: Request) {
  const expected = String(process.env.LICENSE_API_SECRET || "");
  const supplied = request.headers.get("x-license-admin-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected); const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
function clean(value: unknown, max = 2000) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ ok: false, code: "SERVICE_NOT_CONFIGURED" }, { status: 503 });
  const { data, error } = await supabase.from("licenses").select("license_id,customer_id,product,edition,plan,status,issued_at,expires_at,activation_limit,features,metadata,created_at,updated_at").order("created_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ ok: false, code: "DATABASE_ERROR" }, { status: 500 });
  const ids = (data || []).map((x) => x.license_id);
  const { data: activations } = ids.length ? await supabase.from("license_activations").select("license_id,activation_id,device_id,status,activated_at,deactivated_at,last_validated_at").in("license_id", ids).order("activated_at", { ascending: false }) : { data: [] as any[] };
  return NextResponse.json({ ok: true, licenses: (data || []).map((license) => ({ ...license, activations: (activations || []).filter((a) => a.license_id === license.license_id).map((a) => ({ ...a, device_id: a.device_id.slice(0, 8) + "…" })) })) });
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  try {
    const body = await request.json();
    const customerName = clean(body?.customerName, 200);
    const plan = clean(body?.plan, 32) as LicensePlan;
    const edition = clean(body?.edition, 32) as Edition;
    const expiresAt = body?.expiresAt === null || body?.expiresAt === "" || body?.expiresAt === undefined ? null : clean(body?.expiresAt, 64);
    const requestedLimit = Number(body?.activationLimit);
    if (!customerName || !PLANS.includes(plan) || !EDITIONS.includes(edition)) return NextResponse.json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
    if (expiresAt && !Number.isFinite(new Date(expiresAt).getTime())) return NextResponse.json({ ok: false, code: "INVALID_EXPIRY" }, { status: 400 });
    const activationLimit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.floor(requestedLimit) : PLAN_LIMITS[plan].maxDevices;
    const privateKeyHex = clean(process.env.LICENSE_PRIVATE_KEY, 256).replace(/^0x/, "").replace(/\s/g, "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(privateKeyHex)) return NextResponse.json({ ok: false, code: "SIGNING_KEY_NOT_CONFIGURED" }, { status: 503 });
    const supabase = db();
    if (!supabase) return NextResponse.json({ ok: false, code: "SERVICE_NOT_CONFIGURED" }, { status: 503 });

    const issued = await issueLicense({ customerName, plan, edition, expiresAt, activationLimit, privateKeyHex });
    const tokenHash = createHash("sha256").update(issued.token, "utf8").digest("hex");
    const { error } = await supabase.from("licenses").insert({
      id: randomUUID(),
      license_id: issued.payload.licenseId,
      customer_id: issued.payload.customerId,
      product: issued.payload.product,
      edition: issued.payload.edition,
      plan: issued.payload.plan,
      status: "active",
      token: issued.token,
      token_sha256: tokenHash,
      issued_at: issued.payload.issuedAt,
      expires_at: issued.payload.expiresAt,
      activation_limit: issued.payload.activationLimit,
      features: issued.payload.features,
      metadata: { customerName },
    });
    if (error) return NextResponse.json({ ok: false, code: "DATABASE_ERROR", error: error.message }, { status: 500 });
    await supabase.from("license_events").insert({ id: randomUUID(), license_id: issued.payload.licenseId, event_type: "issued", actor: "license-admin", details: { customerName, plan, edition } });
    return NextResponse.json({ ok: true, license: { licenseId: issued.payload.licenseId, customerId: issued.payload.customerId, customerName, plan, edition, status: "active", expiresAt: issued.payload.expiresAt, activationLimit, features: issued.payload.features }, token: issued.token });
  } catch (error) {
    return NextResponse.json({ ok: false, code: "ISSUE_FAILED", error: error instanceof Error ? error.message : "License issuance failed" }, { status: 500 });
  }
}
