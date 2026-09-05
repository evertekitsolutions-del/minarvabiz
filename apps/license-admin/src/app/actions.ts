"use server";

import { cookies } from "next/headers";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";
import { issueLicense, PLAN_LIMITS, type LicensePlan } from "@minarvabiz/licensing";
import type { Edition } from "@minarvabiz/types";

const COOKIE = "minarva-license-admin";
const PLANS: LicensePlan[] = ["trial", "basic", "professional", "business", "enterprise"];
const EDITIONS: Edition[] = ["online", "offline", "hybrid"];
function secret() { return String(process.env.LICENSE_API_SECRET || ""); }
function sessionToken() { const value = secret(); return value ? createHmac("sha256", value).update("minarvabiz-license-admin-session-v1").digest("hex") : ""; }
async function isAdmin() { const token = (await cookies()).get(COOKIE)?.value || ""; const expected = sessionToken(); if (!token || !expected) return false; const a = Buffer.from(token); const b = Buffer.from(expected); return a.length === b.length && timingSafeEqual(a, b); }
function dbConfig() { const base = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, ""); const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""); return base && key ? { base: `${base}/rest/v1`, key } : null; }
async function dbFetch(path: string, init: RequestInit = {}) { const cfg = dbConfig(); if (!cfg) return { ok: false, data: null as any, error: "Supabase is not configured." }; const response = await fetch(`${cfg.base}${path}`, { ...init, headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "content-type": "application/json", ...(init.headers || {}) }, cache: "no-store" }); const data = await response.json().catch(() => null); return { ok: response.ok, data, error: response.ok ? null : (data?.message || data?.error || `Database request failed (${response.status})`) }; }
function clean(value: unknown, max = 2000) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

export async function loginAdmin(password: string) {
  const expected = secret(); const supplied = String(password || ""); if (!expected || !supplied) return { ok: false, error: "Admin authentication is not configured." };
  const a = Buffer.from(expected); const b = Buffer.from(supplied); if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, error: "Invalid admin credential." };
  (await cookies()).set(COOKIE, sessionToken(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 8 * 60 * 60 }); return { ok: true };
}
export async function logoutAdmin() { (await cookies()).delete(COOKIE); return { ok: true }; }

export async function listLicenses() {
  if (!(await isAdmin())) return { ok: false, error: "UNAUTHORIZED", licenses: [] as any[] };
  const result = await dbFetch("/licenses?select=id%2Clicense_id%2Ccustomer_id%2Cproduct%2Cedition%2Cplan%2Cstatus%2Cissued_at%2Cexpires_at%2Cactivation_limit%2Cfeatures%2Cmetadata%2Ccreated_at%2Cupdated_at&order=created_at.desc&limit=200");
  if (!result.ok) return { ok: false, error: result.error, licenses: [] as any[] };
  const licenses = Array.isArray(result.data) ? result.data : []; const ids = licenses.map((x) => x.id);
  const activationResult = ids.length ? await dbFetch(`/license_activations?select=license_id%2Cactivation_id%2Cdevice_id%2Cstatus%2Cactivated_at%2Cdeactivated_at%2Clast_validated_at&license_id=in.(${ids.join(",")})&order=activated_at.desc`) : { ok: true, data: [], error: null };
  const activations = Array.isArray(activationResult.data) ? activationResult.data : [];
  return { ok: true, licenses: licenses.map((license) => ({ ...license, activations: activations.filter((a) => a.license_id === license.id).map((a) => ({ ...a, device_id: a.device_id.slice(0, 8) + "…" })) })) };
}

export async function createCommercialLicense(input: { customerName: string; plan: LicensePlan; edition: Edition; expiresAt?: string | null; activationLimit?: number }) {
  if (!(await isAdmin())) return { ok: false, error: "UNAUTHORIZED" };
  try {
    const customerName = clean(input.customerName, 200); const plan = input.plan; const edition = input.edition; if (!customerName || !PLANS.includes(plan) || !EDITIONS.includes(edition)) return { ok: false, error: "Invalid license details." };
    const expiresAt = input.expiresAt ? clean(input.expiresAt, 64) : null; if (expiresAt && !Number.isFinite(new Date(expiresAt).getTime())) return { ok: false, error: "Invalid expiry date." };
    const requestedLimit = Number(input.activationLimit); const activationLimit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.floor(requestedLimit) : PLAN_LIMITS[plan].maxDevices;
    const privateKeyHex = clean(process.env.LICENSE_PRIVATE_KEY, 256).replace(/^0x/, "").replace(/\s/g, "").toLowerCase(); if (!/^[0-9a-f]{64}$/.test(privateKeyHex)) return { ok: false, error: "LICENSE_PRIVATE_KEY is not configured on the admin server." };
    const issued = await issueLicense({ customerName, plan, edition, expiresAt, activationLimit, privateKeyHex }); const databaseId = randomUUID(); const tokenHash = createHash("sha256").update(issued.token, "utf8").digest("hex");
    const inserted = await dbFetch("/licenses", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id: databaseId, license_id: issued.payload.licenseId, customer_id: issued.payload.customerId, product: issued.payload.product, edition: issued.payload.edition, plan: issued.payload.plan, status: "active", token: issued.token, token_sha256: tokenHash, issued_at: issued.payload.issuedAt, expires_at: issued.payload.expiresAt, activation_limit: activationLimit, features: issued.payload.features, metadata: { customerName } }) });
    if (!inserted.ok) return { ok: false, error: inserted.error };
    await dbFetch("/license_events", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id: randomUUID(), license_id: databaseId, event_type: "issued", actor: "license-admin", details: { customerName, plan, edition } }) });
    return { ok: true, token: issued.token, license: { ...issued.payload, customerName } };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "License issuance failed." }; }
}

export async function setLicenseStatus(licenseId: string, status: "active" | "suspended" | "revoked" | "deactivated") {
  if (!(await isAdmin())) return { ok: false, error: "UNAUTHORIZED" };
  const found = await dbFetch(`/licenses?select=id%2Clicense_id%2Cstatus&license_id=eq.${encodeURIComponent(licenseId)}&limit=1`); if (!found.ok) return { ok: false, error: found.error }; const license = found.data?.[0]; if (!license) return { ok: false, error: "License not found." };
  const updated = await dbFetch(`/licenses?id=eq.${encodeURIComponent(license.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status, updated_at: new Date().toISOString() }) }); if (!updated.ok) return { ok: false, error: updated.error };
  if (status !== "active") await dbFetch(`/license_activations?license_id=eq.${encodeURIComponent(license.id)}&status=eq.active`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "deactivated", deactivated_at: new Date().toISOString() }) });
  const eventType = status === "suspended" ? "suspended" : status === "revoked" ? "revoked" : status === "deactivated" ? "deactivated" : "activated";
  await dbFetch("/license_events", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id: randomUUID(), license_id: license.id, event_type: eventType, actor: "license-admin", details: { previousStatus: license.status, status } }) });
  return { ok: true };
}
