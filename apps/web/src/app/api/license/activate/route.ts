import { NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { signActivationCertificate } from "@minarvabiz/licensing";

export const runtime = "nodejs";
const DEVICE_RE = /^[a-f0-9]{64}$/;
function clean(v: unknown, max = 2000) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }
function db() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}
function privateKeyHex() { return clean(process.env.LICENSE_PRIVATE_KEY, 256).replace(/^0x/, "").replace(/\s/g, "").toLowerCase(); }

async function certificate(licenseId: string, activationId: string, deviceId: string, expiresAt: string | null) {
  const key = privateKeyHex();
  if (!/^[0-9a-f]{64}$/.test(key)) throw new Error("LICENSE_PRIVATE_KEY is not configured");
  return signActivationCertificate({
    type: "minarvabiz-activation-v1",
    licenseId,
    activationId,
    deviceId,
    issuedAt: new Date().toISOString(),
    expiresAt,
  }, key);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = clean(body?.licenseToken);
    const deviceId = clean(body?.deviceId, 64).toLowerCase();
    if (!token || !DEVICE_RE.test(deviceId)) return NextResponse.json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
    const supabase = db();
    if (!supabase) return NextResponse.json({ ok: false, code: "SERVICE_NOT_CONFIGURED" }, { status: 503 });
    const hash = createHash("sha256").update(token, "utf8").digest("hex");
    const { data: license, error: licenseError } = await supabase.from("licenses").select("id,license_id,customer_id,product,edition,plan,status,expires_at,activation_limit,features").eq("token_sha256", hash).maybeSingle();
    if (licenseError) return NextResponse.json({ ok: false, code: "SERVICE_ERROR" }, { status: 503 });
    if (!license) return NextResponse.json({ ok: false, code: "INVALID_LICENSE" }, { status: 401 });
    if (license.product !== "minarvabiz") return NextResponse.json({ ok: false, code: "INVALID_PRODUCT" }, { status: 403 });
    if (license.status !== "active") return NextResponse.json({ ok: false, code: license.status.toUpperCase(), status: license.status }, { status: 403 });
    if (license.expires_at && new Date(license.expires_at).getTime() <= Date.now()) {
      await supabase.from("licenses").update({ status: "expired" }).eq("id", license.id);
      return NextResponse.json({ ok: false, code: "EXPIRED" }, { status: 403 });
    }

    const now = new Date().toISOString();
    const { data: activationRows, error: activationError } = await supabase.rpc("activate_license_device", {
      p_license_id: license.id,
      p_device_id: deviceId,
    });
    if (activationError || !Array.isArray(activationRows) || !activationRows[0]?.activation_id) {
      const code = String(activationError?.message || "");
      if (code.includes("ACTIVATION_LIMIT_REACHED")) return NextResponse.json({ ok: false, code: "ACTIVATION_LIMIT_REACHED" }, { status: 409 });
      if (code.includes("LICENSE_EXPIRED")) return NextResponse.json({ ok: false, code: "EXPIRED" }, { status: 403 });
      if (code.includes("LICENSE_NOT_ACTIVE")) return NextResponse.json({ ok: false, code: "LICENSE_NOT_ACTIVE" }, { status: 403 });
      if (code.includes("INVALID_DEVICE_ID")) return NextResponse.json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
      return NextResponse.json({ ok: false, code: "ACTIVATION_FAILED" }, { status: 409 });
    }

    const activationId = String(activationRows[0].activation_id);
    const activationCertificate = await certificate(license.license_id, activationId, deviceId, license.expires_at);
    await supabase.from("license_events").insert({ id: randomUUID(), license_id: license.id, event_type: "activated", device_id: deviceId, actor: "desktop", details: { activationId } });
    return NextResponse.json({ ok: true, status: "active", licenseId: license.license_id, customerId: license.customer_id, activationId, activationCertificate, plan: license.plan, edition: license.edition, expiresAt: license.expires_at, features: license.features, validatedAt: now });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Activation failed";
    if (message === "LICENSE_PRIVATE_KEY is not configured") return NextResponse.json({ ok: false, code: "SERVICE_NOT_CONFIGURED" }, { status: 503 });
    return NextResponse.json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
  }
}
