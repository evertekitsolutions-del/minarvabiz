import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { adminDbFetch } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEVICE_RE = /^[a-f0-9]{64}$/;

function clean(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const licenseToken = clean(body.licenseToken);
    const deviceId = clean(body.deviceId, 64).toLowerCase();
    if (!licenseToken || !DEVICE_RE.test(deviceId)) {
      return NextResponse.json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
    }

    const hash = createHash("sha256").update(licenseToken, "utf8").digest("hex");
    const found = await adminDbFetch<any[]>(
      `/licenses?select=id%2Clicense_id%2Cstatus&token_sha256=eq.${hash}&limit=1`,
    );
    if (!found.ok) return NextResponse.json({ ok: false, code: "SERVICE_ERROR" }, { status: 503 });

    const license = found.data?.[0];
    if (!license) return NextResponse.json({ ok: false, code: "INVALID_LICENSE" }, { status: 401 });

    const activationResult = await adminDbFetch<any[]>(
      `/license_activations?select=id%2Cactivation_id&license_id=eq.${encodeURIComponent(license.id)}&device_id=eq.${deviceId}&status=eq.active&limit=1`,
    );
    if (!activationResult.ok) return NextResponse.json({ ok: false, code: "SERVICE_ERROR" }, { status: 503 });

    const activation = activationResult.data?.[0];
    if (!activation) return NextResponse.json({ ok: false, code: "DEVICE_NOT_ACTIVATED" }, { status: 404 });

    const deactivatedAt = new Date().toISOString();
    const updated = await adminDbFetch(`/license_activations?id=eq.${encodeURIComponent(activation.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "deactivated", deactivated_at: deactivatedAt }),
    });
    if (!updated.ok) return NextResponse.json({ ok: false, code: "SERVICE_ERROR" }, { status: 503 });

    await adminDbFetch("/license_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: randomUUID(),
        license_id: license.id,
        activation_id: activation.id,
        event_type: "deactivated",
        device_id: deviceId,
        actor: "desktop",
        details: {},
      }),
    });

    return NextResponse.json({
      ok: true,
      status: "deactivated",
      licenseId: license.license_id,
      activationId: activation.activation_id,
      deactivatedAt,
    });
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
  }
}
