import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const DESTINATION = "minarvatechnologies@gmail.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+() .-]{6,50}$/;

function clean(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function htmlEscape(value: string): string {
  return value.replace(/[&<>\"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = clean(body?.email, 254).toLowerCase();
    const phone = clean(body?.phone, 50);
    const organizationName = clean(body?.organizationName, 200);
    const address = clean(body?.address, 500);
    const deviceId = clean(body?.deviceId, 200);

    if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "A valid email address is required." }, { status: 400 });
    if (!PHONE_RE.test(phone)) return NextResponse.json({ ok: false, error: "A valid phone number is required." }, { status: 400 });
    if (!organizationName) return NextResponse.json({ ok: false, error: "Organization name is required." }, { status: 400 });
    if (!address) return NextResponse.json({ ok: false, error: "Address is required." }, { status: 400 });
    if (!deviceId || !/^[A-Za-z0-9-]{16,200}$/.test(deviceId)) return NextResponse.json({ ok: false, error: "Device registration is required." }, { status: 400 });

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    const from = process.env.TRIAL_NOTIFICATION_FROM;

    if (!supabaseUrl || !secretKey || !resendKey || !from) {
      return NextResponse.json({ ok: false, error: "Trial service is not configured." }, { status: 503 });
    }

    const supabase = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const registrationId = crypto.randomUUID();

    const { data: existing, error: existingError } = await supabase
      .from("trial_registrations")
      .select("id, status, trial_started_at, trial_expires_at")
      .or(`email.eq.${email},phone.eq.${phone},device_id.eq.${deviceId}`)
      .limit(1)
      .maybeSingle();

    if (existingError) return NextResponse.json({ ok: false, error: "Could not check trial eligibility." }, { status: 500 });
    if (existing) {
      return NextResponse.json({ ok: false, code: "TRIAL_ALREADY_REGISTERED", error: "A Minarva Biz trial is already registered for this email, phone number, or device.", trial: existing }, { status: 409 });
    }

    const started = new Date();
    const expires = new Date(started.getTime() + 30 * 24 * 60 * 60 * 1000);
    const row = { id: registrationId, email, phone, organization_name: organizationName, address, device_id: deviceId, status: "active", trial_started_at: started.toISOString(), trial_expires_at: expires.toISOString() };
    const { error: insertError } = await supabase.from("trial_registrations").insert(row);
    if (insertError) return NextResponse.json({ ok: false, error: "Could not register the trial." }, { status: 500 });

    const text = [
      "New Minarva Biz 30-day trial registration", "", `Registration ID: ${registrationId}`, `Email: ${email}`, `Phone: ${phone}`,
      `Organization: ${organizationName}`, `Address: ${address}`, `Device ID: ${deviceId}`,
      `Trial starts: ${started.toISOString()}`, `Trial expires: ${expires.toISOString()}`,
    ].join("\n");
    const html = `<h2>New Minarva Biz 30-day trial registration</h2><p><b>Registration ID:</b> ${htmlEscape(registrationId)}</p><p><b>Email:</b> ${htmlEscape(email)}</p><p><b>Phone:</b> ${htmlEscape(phone)}</p><p><b>Organization:</b> ${htmlEscape(organizationName)}</p><p><b>Address:</b> ${htmlEscape(address)}</p><p><b>Device ID:</b> ${htmlEscape(deviceId)}</p><p><b>Trial starts:</b> ${htmlEscape(started.toISOString())}</p><p><b>Trial expires:</b> ${htmlEscape(expires.toISOString())}</p>`;

    const mail = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": `minarvabiz-trial-${registrationId}` },
      body: JSON.stringify({ from, to: [DESTINATION], reply_to: email, subject: `Minarva Biz Trial Registration — ${organizationName}`, text, html }),
    });

    if (!mail.ok) {
      await supabase.from("trial_registrations").update({ status: "registered_email_pending" }).eq("id", registrationId);
      return NextResponse.json({ ok: true, emailQueued: false, warning: "Trial activated, but notification email could not be sent yet.", registrationId, trialStartedAt: started.toISOString(), trialExpiresAt: expires.toISOString() });
    }

    return NextResponse.json({ ok: true, emailQueued: true, registrationId, trialStartedAt: started.toISOString(), trialExpiresAt: expires.toISOString() });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid trial registration request." }, { status: 400 });
  }
}
