import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { adminDbFetch } from "../../../../lib/supabase-admin";
import { consumeRateLimit } from "../../../../lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+() .-]{6,50}$/;
const DEVICE_RE = /^[a-f0-9]{64}$/;
const MAX_BODY_BYTES = 16 * 1024;
const DESTINATION = "minarvatechnologies@gmail.com";

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function normalizePhone(value: string) {
  const plus = value.trim().startsWith("+") ? "+" : "";
  return plus + value.replace(/\D/g, "");
}
function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);
}
const PUBLIC_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: PUBLIC_CORS_HEADERS });
}

async function existsBy(column: "email" | "phone" | "device_id", value: string) {
  const result = await adminDbFetch<any[]>(
    `/trial_registrations?select=id%2Cstatus%2Ctrial_started_at%2Ctrial_expires_at&${column}=eq.${encodeURIComponent(value)}&limit=1`,
  );
  if (!result.ok) throw new Error(result.error || "Could not check trial eligibility.");
  return result.data?.[0] || null;
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
      return NextResponse.json({ ok: false, error: "JSON content type is required." }, { status: 415 });
    }
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: "Request is too large." }, { status: 413 });
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: "Request is too large." }, { status: 413 });
    }
    const body = JSON.parse(raw) as Record<string, unknown>;

    const email = clean(body.email, 254).toLowerCase();
    const phone = normalizePhone(clean(body.phone, 50));
    const organizationName = clean(body.organizationName, 200);
    const address = clean(body.address, 500);
    const deviceId = clean(body.deviceId, 64).toLowerCase();

    if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "A valid email address is required." }, { status: 400 });
    if (!PHONE_RE.test(phone) || phone.replace(/\D/g, "").length < 6) return NextResponse.json({ ok: false, error: "A valid phone number is required." }, { status: 400 });
    if (!organizationName) return NextResponse.json({ ok: false, error: "Organization name is required." }, { status: 400 });
    if (!address) return NextResponse.json({ ok: false, error: "Address is required." }, { status: 400 });
    if (!DEVICE_RE.test(deviceId)) return NextResponse.json({ ok: false, error: "Device registration is required." }, { status: 400 });

    const ipLimit = await consumeRateLimit(request.headers, "trial-register-ip", 10, 60 * 60);
    if (!ipLimit.ok) {
      return NextResponse.json(
        { ok: false, error: "Trial registration is temporarily unavailable." },
        { status: 503, headers: PUBLIC_CORS_HEADERS },
      );
    }
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: "RATE_LIMITED", error: "Too many trial registration attempts." },
        { status: 429, headers: { ...PUBLIC_CORS_HEADERS, "Retry-After": String(ipLimit.retryAfterSeconds) } },
      );
    }
    const deviceLimit = await consumeRateLimit(request.headers, "trial-register-device", 3, 24 * 60 * 60, deviceId);
    if (!deviceLimit.ok) {
      return NextResponse.json(
        { ok: false, error: "Trial registration is temporarily unavailable." },
        { status: 503, headers: PUBLIC_CORS_HEADERS },
      );
    }
    if (!deviceLimit.allowed) {
      return NextResponse.json(
        { ok: false, code: "RATE_LIMITED", error: "Too many trial registration attempts for this device." },
        { status: 429, headers: { ...PUBLIC_CORS_HEADERS, "Retry-After": String(deviceLimit.retryAfterSeconds) } },
      );
    }

    const existing = (await existsBy("email", email)) || (await existsBy("phone", phone)) || (await existsBy("device_id", deviceId));
    if (existing) {
      return NextResponse.json(
        {
          ok: false,
          code: "TRIAL_ALREADY_REGISTERED",
          error: "A Minarva Biz trial is already registered for this email, phone number, or device.",
          trial: existing,
        },
        { status: 409 },
      );
    }

    const registrationId = randomUUID();
    const started = new Date();
    const expires = new Date(started.getTime() + 30 * 24 * 60 * 60 * 1000);
    const inserted = await adminDbFetch("/trial_registrations", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: registrationId,
        email,
        phone,
        organization_name: organizationName,
        address,
        device_id: deviceId,
        status: "active",
        trial_started_at: started.toISOString(),
        trial_expires_at: expires.toISOString(),
      }),
    });
    if (!inserted.ok) {
      if (inserted.error?.includes("23505") || inserted.status === 409) {
        return NextResponse.json(
          { ok: false, code: "TRIAL_ALREADY_REGISTERED", error: "A Minarva Biz trial is already registered for this email, phone number, or device." },
          { status: 409 },
        );
      }
      return NextResponse.json({ ok: false, error: "Could not register the trial." }, { status: 500 });
    }

    let emailQueued = false;
    const resendKey = String(process.env.RESEND_API_KEY || "").trim();
    const from = String(process.env.TRIAL_NOTIFICATION_FROM || "").trim();
    if (resendKey && from) {
      const text = [
        "New Minarva Biz 30-day trial registration",
        "",
        `Registration ID: ${registrationId}`,
        `Email: ${email}`,
        `Phone: ${phone}`,
        `Organization: ${organizationName}`,
        `Address: ${address}`,
        `Device ID: ${deviceId}`,
        `Trial starts: ${started.toISOString()}`,
        `Trial expires: ${expires.toISOString()}`,
      ].join("\n");
      const html = `<h2>New Minarva Biz 30-day trial registration</h2><p><b>Registration ID:</b> ${htmlEscape(registrationId)}</p><p><b>Email:</b> ${htmlEscape(email)}</p><p><b>Phone:</b> ${htmlEscape(phone)}</p><p><b>Organization:</b> ${htmlEscape(organizationName)}</p><p><b>Address:</b> ${htmlEscape(address)}</p><p><b>Device ID:</b> ${htmlEscape(deviceId)}</p><p><b>Trial starts:</b> ${htmlEscape(started.toISOString())}</p><p><b>Trial expires:</b> ${htmlEscape(expires.toISOString())}</p>`;
      try {
        const mail = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `minarvabiz-trial-${registrationId}`,
          },
          body: JSON.stringify({
            from,
            to: [DESTINATION],
            reply_to: email,
            subject: `Minarva Biz Trial Registration — ${organizationName}`,
            text,
            html,
          }),
        });
        emailQueued = mail.ok;
      } catch {
        emailQueued = false;
      }
    }

    if (!emailQueued) {
      await adminDbFetch(`/trial_registrations?id=eq.${registrationId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "registered_email_pending" }),
      });
    }

    return NextResponse.json(
      {
        ok: true,
        emailQueued,
        registrationId,
        trialStartedAt: started.toISOString(),
        trialExpiresAt: expires.toISOString(),
      },
      { headers: PUBLIC_CORS_HEADERS },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid trial registration request." }, { status: 400 });
  }
}
