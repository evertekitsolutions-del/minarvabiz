"use server";

import { cookies } from "next/headers";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { issueLicense, PLAN_LIMITS, type LicensePlan } from "@minarvabiz/licensing";
import type { Edition } from "@minarvabiz/types";

const COOKIE = "minarva-license-admin";
const PLANS: LicensePlan[] = ["trial", "basic", "professional", "business", "enterprise"];
const EDITIONS: Edition[] = ["online", "offline", "hybrid"];
function secret() { return String(process.env.LICENSE_API_SECRET || ""); }
function db() { const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY; return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null; }
function sessionToken() { const value = secret(); return value ? createHmac("sha256", value).update("minarvabiz-license-admin-session-v1").digest("hex") : ""; }
async function isAdmin() { const token = (await cookies()).get(COOKIE)?.value || ""; const expected = sessionToken(); if (!token || !expected) return false; const a = Buffer.from(token); const b = Buffer.from(expected); return a.length === b.length && timingSafeEqual(a, b); }
function clean(value: unknown, max = 2000) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

export async function loginAdmin(password: string) {
  const expected = secret(); const supplied = String(password || "");
  if (!expected || !supplied) return { ok: false, error: "Admin authentication is not configured." };
  const a = Buffer.from(expected); const b = Buffer.from(supplied);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, error: "Invalid admin credential." };
  (await cookies()).set(COOKIE, sessionToken(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 8 * 60 * 60 });
  return { ok: true };
}
export async function logoutAdmin() { (await cookies()).delete(COOKIE); return { ok: true }; }

export async function listLicenses() {
  if (!(await isAdmin())) return { ok: false, error: "UNAUTHORIZED", licenses: [] };
  const supabase = db(); if (!supabase) return { ok: false, error: "SERVICE_NOT_CONFIGURED", licenses: [] };
  const { data, error } = await supabase.from("licenses").select("id,license_id,customer_id,product,edition,plan,status,issued_at,expires_at,activation_limit,features,metadata,created_at,updated_at").order("created_at", { ascending: false }).limit(200);
  if (error) return { ok: false, error: "DATABASE_ERROR", licenses: [] };
  const ids = (data || []).map((x) => x.id);
  const { data: activations } = ids.length ? await supabase.from("license_activations").select("license_id,activation_id,device_id,status,activated_at,deactivated_at,last_validated_at").in("license_id", ids).order("activated_at", { ascending: false }) : { data: [] as any[] };
  return { ok: true, licenses: (data || []).map((license) => ({ ...license, activations: (activations || []).filter((a) => a.license_id === license.id).map((a) => ({ ...a, device_id: a.device_id.slice(0, 8) + "…" })) })) };
}

export async function createCommercialLicense(input: { customerName: string; plan: LicensePlan; edition: Edition; expiresAt?: string | null; activationLimit?: number }) {
  if (!(await isAdmin())) return { ok: false, error: "UNAUTHORIZED" };
  try {
    const customerName = clean(input.customerName, 200); const plan = input.plan; const edition = input.edition;
    if (!customerName || !PLANS.includes(plan) || !EDITIONS.includes(edition)) return { ok: false, error: "Invalid license details." };
    const expiresAt = input.expiresAt ? clean(input.expiresAt, 64) : null;
    if (expiresAt && !Number.isFinite(new Date(expiresAt).getTime())) return { ok: false, error: "Invalid expiry date." };
    const requestedLimit = Number(input.activationLimit); const activationLimit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.floor(requestedLimit) : PLAN_LIMITS[plan].maxDevices;
    const privateKeyHex = clean(process.env.LICENSE_PRIVATE_KEY, 256).replace(/^0x/, "").replace(/\s/g, "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(privateKeyHex)) return { ok: false, error: "LICENSE_PRIVATE_KEY is not configured on the admin server." };
    const supabase = db(); if (!supabase) return { ok: false, error: "Supabase is not configured." };
    const issued = await issueLicense({ customerName, plan, edition, expiresAt, activationLimit, privateKeyHex });
    const databaseId = randomUUID(); const tokenHash = createHash("sha256").update(issued.token, "utf8").digest("hex");
    const { error } = await supabase.from("licenses").insert({ id: databaseId, license_id: issued.payload.licenseId, customer_id: issued.payload.customerId, product: issued.payload.product, edition: issued.payload.edition, plan: issued.payload.plan, status: "active", token: issued.token, token_sha256: tokenHash, issued_at: issued.payload.issuedAt, expires_at: issued.payload.expiresAt, activation_limit: activationLimit, features: issued.payload.features, metadata: { customerName } });
    if (error) return { ok: false, error: error.message };
    await supabase.from("license_events").insert({ id: randomUUID(), license_id: databaseId, event_type: "issued", actor: "license-admin", details: { customerName, plan, edition } });
    return { ok: true, token: issued.token, license: { ...issued.payload, customerName } };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "License issuance failed." }; }
}

export async function setLicenseStatus(licenseId: string, status: "active" | "suspended" | "revoked" | "deactivated") {
  if (!(await isAdmin())) return { ok: false, error: "UNAUTHORIZED" };
  const supabase = db(); if (!supabase) return { ok: false, error: "Supabase is not configured." };
  const { data: license } = await supabase.from("licenses").select("id,license_id,status").eq("license_id", licenseId).maybeSingle();
  if (!license) return { ok: false, error: "License not found." };
  const { error } = await supabase.from("licenses").update({ status, updated_at: new Date().toISOString() }).eq("id", license.id);
  if (error) return { ok: false, error: error.message };
  if (status !== "active") await supabase.from("license_activations").update({ status: "deactivated", deactivated_at: new Date().toISOString() }).eq("license_id", license.id).eq("status", "active");
  const eventType = status === "suspended" ? "suspended" : status === "revoked" ? "revoked" : status === "deactivated" ? "deactivated" : "activated";
  await supabase.from("license_events").insert({ id: randomUUID(), license_id: license.id, event_type: eventType, actor: "license-admin", details: { previousStatus: license.status, status } });
  return { ok: true };
}
