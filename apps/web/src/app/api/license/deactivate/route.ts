import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const DEVICE_RE = /^[a-f0-9]{64}$/;

function clean(value: unknown, max = 2000): string { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function db() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = clean(body?.licenseToken);
    const deviceId = clean(body?.deviceId, 64).toLowerCase();
    if (!token || !DEVICE_RE.test(deviceId)) return NextResponse.json({ ok:false, code:"INVALID_REQUEST" }, { status:400 });
    const supabase = db();
    if (!supabase) return NextResponse.json({ ok:false, code:"SERVICE_NOT_CONFIGURED" }, { status:503 });
    const hash = createHash("sha256").update(token, "utf8").digest("hex");
    const { data: license } = await supabase.from("licenses").select("id,license_id,status").eq("token_sha256", hash).maybeSingle();
    if (!license) return NextResponse.json({ ok:false, code:"INVALID_LICENSE" }, { status:401 });
    const { data: activation } = await supabase.from("license_activations").select("id,activation_id").eq("license_id", license.id).eq("device_id", deviceId).eq("status","active").maybeSingle();
    if (!activation) return NextResponse.json({ ok:false, code:"DEVICE_NOT_ACTIVATED" }, { status:404 });
    const now = new Date().toISOString();
    await supabase.from("license_activations").update({ status:"deactivated", deactivated_at:now }).eq("id", activation.id);
    await supabase.from("license_events").insert({ license_id:license.id, activation_id:activation.id, event_type:"deactivated", device_id:deviceId, actor:"desktop", details:{} });
    return NextResponse.json({ ok:true, status:"deactivated", licenseId:license.license_id, activationId:activation.activation_id, deactivatedAt:now });
  } catch { return NextResponse.json({ ok:false, code:"INVALID_REQUEST" }, { status:400 }); }
}
