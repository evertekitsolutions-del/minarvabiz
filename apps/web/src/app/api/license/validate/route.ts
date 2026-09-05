import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { signActivationCertificate } from "@minarvabiz/licensing";

export const runtime = "nodejs";
const DEVICE_RE = /^[a-f0-9]{64}$/;
function clean(value: unknown, max = 2000): string { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function db() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function tokenHash(token: string) { return createHash("sha256").update(token, "utf8").digest("hex"); }
function privateKeyHex() { return clean(process.env.LICENSE_PRIVATE_KEY, 256).replace(/^0x/, "").replace(/\s/g, "").toLowerCase(); }
async function makeCertificate(licenseId: string, activationId: string, deviceId: string, expiresAt: string | null) {
  const key = privateKeyHex();
  if (!/^[0-9a-f]{64}$/.test(key)) throw new Error("LICENSE_PRIVATE_KEY is not configured");
  return signActivationCertificate({ type: "minarvabiz-activation-v1", licenseId, activationId, deviceId, issuedAt: new Date().toISOString(), expiresAt }, key);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const licenseToken = clean(body?.licenseToken);
    const deviceId = clean(body?.deviceId, 64).toLowerCase();
    if (!licenseToken || !DEVICE_RE.test(deviceId)) return NextResponse.json({ ok: false, code: "INVALID_REQUEST", error: "License token and device ID are required." }, { status: 400 });
    const supabase = db();
    if (!supabase) return NextResponse.json({ ok: false, code: "SERVICE_NOT_CONFIGURED", error: "License service is not configured." }, { status: 503 });

    const hash = tokenHash(licenseToken);
    const { data: license, error } = await supabase.from("licenses").select("id,license_id,customer_id,product,edition,plan,status,expires_at,activation_limit,features").eq("token_sha256", hash).maybeSingle();
    if (error) return NextResponse.json({ ok: false, code: "DATABASE_ERROR" }, { status: 500 });
    if (!license) return NextResponse.json({ ok: false, code: "INVALID_LICENSE", error: "License could not be verified." }, { status: 401 });
    if (license.product !== "minarvabiz") return NextResponse.json({ ok: false, code: "INVALID_PRODUCT" }, { status: 403 });

    const now = new Date();
    if (license.expires_at && new Date(license.expires_at).getTime() <= now.getTime() && license.status === "active") {
      await supabase.from("licenses").update({ status: "expired" }).eq("id", license.id);
      return NextResponse.json({ ok: false, code: "EXPIRED", licenseId: license.license_id }, { status: 403 });
    }
    if (license.status !== "active") return NextResponse.json({ ok: false, code: license.status.toUpperCase(), licenseId: license.license_id, status: license.status }, { status: 403 });

    const { data: activation } = await supabase.from("license_activations").select("id,activation_id,status,device_id,activated_at").eq("license_id", license.id).eq("device_id", deviceId).eq("status", "active").maybeSingle();
    if (!activation) return NextResponse.json({ ok: false, code: "DEVICE_NOT_ACTIVATED", licenseId: license.license_id }, { status: 403 });

    const validatedAt = now.toISOString();
    await supabase.from("license_activations").update({ last_validated_at: validatedAt }).eq("id", activation.id);
    await supabase.from("license_events").insert({ license_id: license.id, activation_id: activation.id, event_type: "validated", device_id: deviceId, actor: "desktop", details: {} });
    const activationCertificate = await makeCertificate(license.license_id, activation.activation_id, deviceId, license.expires_at);

    return NextResponse.json({ ok: true, status: "active", licenseId: license.license_id, customerId: license.customer_id, plan: license.plan, edition: license.edition, expiresAt: license.expires_at, features: license.features, activationId: activation.activation_id, activationCertificate, validatedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid license validation request.";
    if (message === "LICENSE_PRIVATE_KEY is not configured") return NextResponse.json({ ok: false, code: "SERVICE_NOT_CONFIGURED" }, { status: 503 });
    return NextResponse.json({ ok: false, code: "INVALID_REQUEST", error: "Invalid license validation request." }, { status: 400 });
  }
}
