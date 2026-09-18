import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { signActivationCertificate } from "@minarvabiz/licensing";
import { privateKeyHex } from "../../../../lib/signing-key";
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
      `/licenses?select=id%2Clicense_id%2Ccustomer_id%2Cproduct%2Cedition%2Cplan%2Cstatus%2Cexpires_at%2Cfeatures&token_sha256=eq.${hash}&limit=1`,
    );
    if (!found.ok) return NextResponse.json({ ok: false, code: "SERVICE_ERROR" }, { status: 503 });

    const license = found.data?.[0];
    if (!license) return NextResponse.json({ ok: false, code: "INVALID_LICENSE" }, { status: 401 });
    if (license.product !== "minarvabiz") return NextResponse.json({ ok: false, code: "INVALID_PRODUCT" }, { status: 403 });

    if (license.expires_at && new Date(license.expires_at).getTime() <= Date.now() && license.status === "active") {
      await adminDbFetch(`/licenses?id=eq.${encodeURIComponent(license.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "expired", updated_at: new Date().toISOString() }),
      });
      return NextResponse.json({ ok: false, code: "EXPIRED", licenseId: license.license_id }, { status: 403 });
    }

    if (license.status !== "active") {
      return NextResponse.json(
        { ok: false, code: String(license.status || "INACTIVE").toUpperCase(), licenseId: license.license_id },
        { status: 403 },
      );
    }

    const activationResult = await adminDbFetch<any[]>(
      `/license_activations?select=id%2Cactivation_id%2Cstatus%2Cdevice_id%2Cactivated_at&license_id=eq.${encodeURIComponent(license.id)}&device_id=eq.${deviceId}&status=eq.active&limit=1`,
    );
    if (!activationResult.ok) return NextResponse.json({ ok: false, code: "SERVICE_ERROR" }, { status: 503 });

    const activation = activationResult.data?.[0];
    if (!activation) {
      return NextResponse.json({ ok: false, code: "DEVICE_NOT_ACTIVATED", licenseId: license.license_id }, { status: 403 });
    }

    const validatedAt = new Date().toISOString();
    await adminDbFetch(`/license_activations?id=eq.${encodeURIComponent(activation.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ last_validated_at: validatedAt }),
    });

    const signingKey = privateKeyHex();
    if (!/^[0-9a-f]{64}$/.test(signingKey)) {
      return NextResponse.json({ ok: false, code: "SERVICE_NOT_CONFIGURED" }, { status: 503 });
    }
    const activationCertificate = await signActivationCertificate(
      {
        type: "minarvabiz-activation-v1",
        licenseId: license.license_id,
        activationId: activation.activation_id,
        deviceId,
        issuedAt: validatedAt,
        expiresAt: license.expires_at || null,
      },
      signingKey,
    );

    await adminDbFetch("/license_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: randomUUID(),
        license_id: license.id,
        activation_id: activation.id,
        event_type: "validated",
        device_id: deviceId,
        actor: "desktop",
        details: {},
      }),
    });

    return NextResponse.json({
      ok: true,
      status: "active",
      licenseId: license.license_id,
      customerId: license.customer_id,
      plan: license.plan,
      edition: license.edition,
      expiresAt: license.expires_at,
      features: license.features,
      activationId: activation.activation_id,
      activationCertificate,
      validatedAt,
    });
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
  }
}
