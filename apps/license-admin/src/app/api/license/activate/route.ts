import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { signActivationCertificate } from "@minarvabiz/licensing";
import { privateKeyHex } from "../../../../lib/signing-key";
import { adminDbFetch } from "../../../../lib/supabase-admin";
import { consumeRateLimit } from "../../../../lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEVICE_RE = /^[a-f0-9]{64}$/;
const MAX_BODY_BYTES = 16 * 1024;

function clean(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) return null;
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return null;
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
      return NextResponse.json({ ok: false, code: "UNSUPPORTED_MEDIA_TYPE" }, { status: 415 });
    }
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, code: "REQUEST_TOO_LARGE" }, { status: 413 });
    }

    const body = await readBody(request);
    if (!body) return NextResponse.json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });

    const licenseToken = clean(body.licenseToken);
    const deviceId = clean(body.deviceId, 64).toLowerCase();
    if (!licenseToken || !DEVICE_RE.test(deviceId)) {
      return NextResponse.json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
    }

    const hash = createHash("sha256").update(licenseToken, "utf8").digest("hex");
    const ipLimit = await consumeRateLimit(request.headers, "license-activate-ip", 30, 15 * 60);
    if (!ipLimit.ok) return NextResponse.json({ ok: false, code: "RATE_LIMIT_UNAVAILABLE" }, { status: 503 });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
      );
    }
    const deviceLimit = await consumeRateLimit(request.headers, "license-activate-device", 10, 15 * 60, deviceId);
    if (!deviceLimit.ok) return NextResponse.json({ ok: false, code: "RATE_LIMIT_UNAVAILABLE" }, { status: 503 });
    if (!deviceLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(deviceLimit.retryAfterSeconds) } },
      );
    }
    const found = await adminDbFetch<any[]>(
      `/licenses?select=id%2Clicense_id%2Ccustomer_id%2Cproduct%2Cedition%2Cplan%2Cstatus%2Cexpires_at%2Cactivation_limit%2Cfeatures&token_sha256=eq.${hash}&limit=1`,
    );
    if (!found.ok) return NextResponse.json({ ok: false, code: "SERVICE_ERROR" }, { status: 503 });

    const license = found.data?.[0];
    if (!license) return NextResponse.json({ ok: false, code: "INVALID_LICENSE" }, { status: 401 });
    if (license.product !== "minarvabiz") return NextResponse.json({ ok: false, code: "INVALID_PRODUCT" }, { status: 403 });
    if (license.status !== "active") {
      return NextResponse.json({ ok: false, code: String(license.status || "INACTIVE").toUpperCase() }, { status: 403 });
    }

    if (license.expires_at && new Date(license.expires_at).getTime() <= Date.now()) {
      await adminDbFetch(`/licenses?id=eq.${encodeURIComponent(license.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "expired", updated_at: new Date().toISOString() }),
      });
      return NextResponse.json({ ok: false, code: "EXPIRED" }, { status: 403 });
    }

    const activationResult = await adminDbFetch<any[]>("/rpc/activate_license_device", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ p_license_id: license.id, p_device_id: deviceId }),
    });
    if (!activationResult.ok || !Array.isArray(activationResult.data) || !activationResult.data[0]?.activation_id) {
      const message = String(activationResult.error || "");
      if (message.includes("ACTIVATION_LIMIT_REACHED")) {
        return NextResponse.json({ ok: false, code: "ACTIVATION_LIMIT_REACHED" }, { status: 409 });
      }
      if (message.includes("LICENSE_EXPIRED")) return NextResponse.json({ ok: false, code: "EXPIRED" }, { status: 403 });
      if (message.includes("LICENSE_NOT_ACTIVE")) return NextResponse.json({ ok: false, code: "LICENSE_NOT_ACTIVE" }, { status: 403 });
      if (message.includes("INVALID_DEVICE_ID")) return NextResponse.json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
      return NextResponse.json({ ok: false, code: "ACTIVATION_FAILED" }, { status: 409 });
    }

    const activationId = String(activationResult.data[0].activation_id);
    const activationRowId = String(activationResult.data[0].activation_row_id || "");
    const signingKey = privateKeyHex();
    if (!/^[0-9a-f]{64}$/.test(signingKey)) {
      return NextResponse.json({ ok: false, code: "SERVICE_NOT_CONFIGURED" }, { status: 503 });
    }

    const validatedAt = new Date().toISOString();
    const activationCertificate = await signActivationCertificate(
      {
        type: "minarvabiz-activation-v1",
        licenseId: license.license_id,
        activationId,
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
        activation_id: activationRowId || null,
        event_type: "activated",
        device_id: deviceId,
        actor: "desktop",
        details: { activationId },
      }),
    });

    return NextResponse.json({
      ok: true,
      status: "active",
      licenseId: license.license_id,
      customerId: license.customer_id,
      activationId,
      activationCertificate,
      plan: license.plan,
      edition: license.edition,
      expiresAt: license.expires_at,
      features: license.features,
      validatedAt,
    });
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_REQUEST" }, { status: 400 });
  }
}
