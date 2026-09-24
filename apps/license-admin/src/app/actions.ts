"use server";

import { cookies, headers } from "next/headers";
import { createHash, randomUUID } from "crypto";
import { issueLicense, PLAN_LIMITS, signActivationCertificate, PLAN_FEATURES, type LicensePlan } from "@minarvabiz/licensing";
import type { Edition, LicenseFeatures } from "@minarvabiz/types";
import { privateKeyHex } from "../lib/signing-key";
import {
  ADMIN_COOKIE,
  ADMIN_MFA_COOKIE,
  adminCookieOptions,
  adminMfaCookieOptions,
  createAdminMfaPendingToken,
  createAdminSessionToken,
  emergencyAdminCredentialStatus,
  emergencyAdminIdentity,
  readAdminMfaPendingToken,
  readAdminSessionToken,
  verifyEmergencyAdminCredential,
  type AdminIdentity,
} from "../lib/admin-session";
import {
  authenticateNamedAdmin,
  beginNamedAdminMfaChallenge,
  beginNamedAdminTotpEnrollment,
  normalizeAdminEmail,
  verifyNamedAdminMfa,
} from "../lib/named-admin";
import {
  registerAdminSession,
  revokeRegisteredAdminSession,
  validateRegisteredAdminSession,
  type AdminSessionAuthMethod,
} from "../lib/admin-session-store";
import {
  checkAdminLoginBackoff,
  clearAdminLoginFailures,
  consumeRateLimit,
  recordAdminLoginFailure,
} from "../lib/rate-limit";

const PLANS: LicensePlan[] = ["trial", "basic", "professional", "business", "enterprise"];
const EDITIONS: Edition[] = ["online", "offline", "hybrid"];

async function currentAdminSession() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value || "";
  const claims = readAdminSessionToken(token);
  if (!claims) return null;
  if (!(await validateRegisteredAdminSession(claims))) return null;
  return claims;
}

async function currentAdminIdentity() {
  return (await currentAdminSession())?.identity || null;
}

async function isAdmin() {
  return Boolean(await currentAdminIdentity());
}

async function establishAdminSession(identity: AdminIdentity, authMethod: AdminSessionAuthMethod) {
  const registered = await registerAdminSession(identity, authMethod);
  if (!registered.ok) return { ok: false as const, error: registered.error };
  const token = createAdminSessionToken(identity, registered.sessionId, registered.expiresAtMs);
  if (!token) {
    await revokeRegisteredAdminSession(registered.sessionId, "session-signing-failed");
    return { ok: false as const, error: "Admin session signing is not configured." };
  }
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, token, adminCookieOptions(identity.source));
  cookieStore.delete(ADMIN_MFA_COOKIE);
  return { ok: true as const };
}

async function pendingAdminMfaState() {
  const token = (await cookies()).get(ADMIN_MFA_COOKIE)?.value || "";
  return readAdminMfaPendingToken(token);
}

async function storeAdminMfaState(state: Parameters<typeof createAdminMfaPendingToken>[0]) {
  const token = createAdminMfaPendingToken(state);
  if (!token) return false;
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_MFA_COOKIE, token, adminMfaCookieOptions());
  cookieStore.delete(ADMIN_COOKIE);
  return true;
}

function dbConfig() { const base = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, ""); const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""); return base && key ? { base: `${base}/rest/v1`, key } : null; }
async function dbFetch(path: string, init: RequestInit = {}) { const cfg = dbConfig(); if (!cfg) return { ok: false, data: null as any, error: "Supabase is not configured." }; const headers = new Headers(init.headers); headers.set("apikey", cfg.key); headers.set("content-type", "application/json"); if (cfg.key.startsWith("sb_secret_")) headers.delete("authorization"); else headers.set("authorization", `Bearer ${cfg.key}`); const response = await fetch(`${cfg.base}${path}`, { ...init, headers, cache: "no-store" }); const data = await response.json().catch(() => null); return { ok: response.ok, data, error: response.ok ? null : (data?.message || data?.error || `Database request failed (${response.status})`) }; }
function clean(value: unknown, max = 2000) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

export async function loginAdmin(email: string, password: string) {
  const requestHeaders = await headers();
  const normalizedEmail = normalizeAdminEmail(email);
  const subject = `named:${normalizedEmail || "invalid"}`;

  const backoff = await checkAdminLoginBackoff(requestHeaders, subject);
  if (!backoff.ok) return { ok: false, error: "Admin authentication is temporarily unavailable." };
  if (!backoff.allowed) {
    return { ok: false, error: `Too many sign-in attempts. Try again in ${backoff.retryAfterSeconds} seconds.` };
  }

  const throttle = await consumeRateLimit(requestHeaders, "admin-login", 5, 15 * 60, subject);
  if (!throttle.ok) return { ok: false, error: "Admin authentication is temporarily unavailable." };
  if (!throttle.allowed) {
    return { ok: false, error: `Too many sign-in attempts. Try again in ${throttle.retryAfterSeconds} seconds.` };
  }

  const auth = await authenticateNamedAdmin(normalizedEmail, password);
  if (!auth.ok) {
    if (!auth.rejected) return { ok: false, error: auth.error };
    const failure = await recordAdminLoginFailure(requestHeaders, subject);
    if (!failure.ok) return { ok: false, error: "Admin authentication is temporarily unavailable." };
    return { ok: false, error: `Invalid administrator credentials. Try again in ${failure.retryAfterSeconds} seconds.` };
  }

  const cleared = await clearAdminLoginFailures(requestHeaders, subject);
  if (!cleared.ok) return { ok: false, error: "Admin authentication is temporarily unavailable." };

  const factorId = auth.verifiedTotpFactorIds[0] || "";
  if (factorId) {
    const challenge = await beginNamedAdminMfaChallenge(auth.accessToken, factorId);
    if (!challenge.ok) return challenge;
    const stored = await storeAdminMfaState({
      identity: auth.identity,
      accessToken: auth.accessToken,
      mode: "challenge",
      factorId,
      challengeId: challenge.challengeId,
    });
    if (!stored) return { ok: false, error: "Administrator MFA session could not be prepared." };
    return { ok: true, next: "mfa" as const };
  }

  const stored = await storeAdminMfaState({
    identity: auth.identity,
    accessToken: auth.accessToken,
    mode: "enroll",
  });
  if (!stored) return { ok: false, error: "Administrator MFA enrollment could not be prepared." };
  return { ok: true, next: "enroll" as const };
}

export async function beginAdminMfaEnrollment() {
  const pending = await pendingAdminMfaState();
  if (!pending || pending.identity.source !== "supabase" || pending.mode !== "enroll") {
    return { ok: false, error: "Administrator MFA enrollment has expired. Sign in again." };
  }

  const requestHeaders = await headers();
  const throttle = await consumeRateLimit(
    requestHeaders,
    "admin-mfa-enroll",
    5,
    60 * 60,
    pending.identity.id,
  );
  if (!throttle.ok) return { ok: false, error: "Administrator MFA is temporarily unavailable." };
  if (!throttle.allowed) {
    return { ok: false, error: `Too many MFA setup attempts. Try again in ${throttle.retryAfterSeconds} seconds.` };
  }

  const enrolled = await beginNamedAdminTotpEnrollment(pending.accessToken);
  if (!enrolled.ok) return enrolled;
  const stored = await storeAdminMfaState({
    identity: pending.identity,
    accessToken: pending.accessToken,
    mode: "challenge",
    factorId: enrolled.factorId,
    challengeId: enrolled.challengeId,
  });
  if (!stored) return { ok: false, error: "Administrator MFA challenge could not be prepared." };

  return {
    ok: true,
    secret: enrolled.secret.slice(0, 512),
    uri: enrolled.uri.slice(0, 4096),
    qrCode: enrolled.qrCode.slice(0, 100000),
  };
}

export async function verifyAdminMfa(code: string) {
  const pending = await pendingAdminMfaState();
  if (
    !pending ||
    pending.identity.source !== "supabase" ||
    pending.mode !== "challenge" ||
    !pending.factorId ||
    !pending.challengeId
  ) {
    return { ok: false, error: "Administrator MFA challenge has expired. Sign in again." };
  }

  const requestHeaders = await headers();
  const throttle = await consumeRateLimit(
    requestHeaders,
    "admin-mfa-verify",
    10,
    5 * 60,
    pending.identity.id,
  );
  if (!throttle.ok) return { ok: false, error: "Administrator MFA is temporarily unavailable." };
  if (!throttle.allowed) {
    return { ok: false, error: `Too many MFA verification attempts. Try again in ${throttle.retryAfterSeconds} seconds.` };
  }

  const verified = await verifyNamedAdminMfa(
    pending.accessToken,
    pending.factorId,
    pending.challengeId,
    code,
    pending.identity.id,
  );
  if (!verified.ok) return verified;

  const session = await establishAdminSession(pending.identity, "totp");
  if (!session.ok) return session;
  return { ok: true };
}

export async function cancelAdminMfa() {
  (await cookies()).delete(ADMIN_MFA_COOKIE);
  return { ok: true };
}

export async function loginEmergencyAdmin(password: string) {
  const requestHeaders = await headers();
  const subject = "emergency";

  const backoff = await checkAdminLoginBackoff(requestHeaders, subject);
  if (!backoff.ok) return { ok: false, error: "Admin authentication is temporarily unavailable." };
  if (!backoff.allowed) {
    return { ok: false, error: `Too many sign-in attempts. Try again in ${backoff.retryAfterSeconds} seconds.` };
  }

  const throttle = await consumeRateLimit(requestHeaders, "admin-emergency-login", 5, 15 * 60, subject);
  if (!throttle.ok) return { ok: false, error: "Admin authentication is temporarily unavailable." };
  if (!throttle.allowed) {
    return { ok: false, error: `Too many sign-in attempts. Try again in ${throttle.retryAfterSeconds} seconds.` };
  }

  const credentialStatus = emergencyAdminCredentialStatus();
  if (!credentialStatus.enabled) {
    return { ok: false, error: "Emergency shared-secret admin sign-in is disabled." };
  }
  if (!credentialStatus.currentConfigured || !credentialStatus.actorConfigured) {
    return { ok: false, error: "Emergency admin access is not configured securely." };
  }

  const credentialMatch = verifyEmergencyAdminCredential(String(password || ""));
  if (!credentialMatch) {
    const failure = await recordAdminLoginFailure(requestHeaders, subject);
    if (!failure.ok) return { ok: false, error: "Admin authentication is temporarily unavailable." };
    return { ok: false, error: `Invalid emergency admin credential. Try again in ${failure.retryAfterSeconds} seconds.` };
  }

  const identity = emergencyAdminIdentity();
  if (!identity) return { ok: false, error: "Emergency admin actor identity is not configured." };

  const cleared = await clearAdminLoginFailures(requestHeaders, subject);
  if (!cleared.ok) return { ok: false, error: "Admin authentication is temporarily unavailable." };

  const session = await establishAdminSession(identity, "emergency");
  if (!session.ok) return session;
  return { ok: true };
}

export async function logoutAdmin() {
  const cookieStore = await cookies();
  const claims = readAdminSessionToken(cookieStore.get(ADMIN_COOKIE)?.value || "");
  if (claims) await revokeRegisteredAdminSession(claims.sessionId, "logout");
  cookieStore.delete(ADMIN_COOKIE);
  cookieStore.delete(ADMIN_MFA_COOKIE);
  return { ok: true };
}

export async function listLicenses() {
  const identity = await currentAdminIdentity();
  if (!identity) return { ok: false, error: "UNAUTHORIZED", identity: null, licenses: [] as any[] };
  const result = await dbFetch("/licenses?select=id%2Clicense_id%2Ccustomer_id%2Cproduct%2Cedition%2Cplan%2Cstatus%2Cissued_at%2Cexpires_at%2Cactivation_limit%2Cfeatures%2Cmetadata%2Ccreated_at%2Cupdated_at&order=created_at.desc&limit=200");
  if (!result.ok) return { ok: false, error: result.error, identity, licenses: [] as any[] };
  const licenses = Array.isArray(result.data) ? result.data : []; const ids = licenses.map((x) => x.id);
  const activationResult = ids.length ? await dbFetch(`/license_activations?select=license_id%2Cactivation_id%2Cdevice_id%2Cstatus%2Cactivated_at%2Cdeactivated_at%2Clast_validated_at&license_id=in.(${ids.join(",")})&order=activated_at.desc`) : { ok: true, data: [], error: null };
  const activations = Array.isArray(activationResult.data) ? activationResult.data : [];
  return { ok: true, identity, licenses: licenses.map((license) => ({ ...license, activations: activations.filter((a) => a.license_id === license.id).map((a) => ({ ...a, device_id: String(a.device_id).slice(0, 8) + "…" })) })) };
}

export async function createCommercialLicense(input: { customerName: string; plan: LicensePlan; edition: Edition; expiresAt?: string | null; activationLimit?: number; featureOverrides?: Partial<LicenseFeatures> }) {
  if (!(await isAdmin())) return { ok: false, error: "UNAUTHORIZED" };
  try {
    const customerName = clean(input.customerName, 200); const plan = input.plan; const edition = input.edition;
    if (!customerName || !PLANS.includes(plan) || !EDITIONS.includes(edition)) return { ok: false, error: "Invalid license details." };
    const expiresAt = input.expiresAt ? clean(input.expiresAt, 64) : null; if (expiresAt && !Number.isFinite(new Date(expiresAt).getTime())) return { ok: false, error: "Invalid expiry date." };
    const requestedLimit = Number(input.activationLimit); const activationLimit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.floor(requestedLimit) : PLAN_LIMITS[plan].maxDevices;
    const privateKey = privateKeyHex(); if (!/^[0-9a-f]{64}$/.test(privateKey)) return { ok: false, error: "LICENSE_PRIVATE_KEY is not configured on the admin server." };
    const featureOverrides: Partial<LicenseFeatures> = {};
    for (const key of Object.keys(PLAN_FEATURES[plan]) as (keyof LicenseFeatures)[]) { if (input.featureOverrides?.[key] === false) featureOverrides[key] = false; }
    const issued = await issueLicense({ customerName, plan, edition, expiresAt, activationLimit, featureOverrides, privateKeyHex: privateKey }); const databaseId = randomUUID(); const tokenHash = createHash("sha256").update(issued.token, "utf8").digest("hex");
    const inserted = await dbFetch("/licenses", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id: databaseId, license_id: issued.payload.licenseId, customer_id: issued.payload.customerId, product: issued.payload.product, edition: issued.payload.edition, plan: issued.payload.plan, status: "active", token: issued.token, token_sha256: tokenHash, issued_at: issued.payload.issuedAt, expires_at: issued.payload.expiresAt, activation_limit: activationLimit, features: issued.payload.features, metadata: { customerName } }) });
    if (!inserted.ok) return { ok: false, error: inserted.error };
    await dbFetch("/license_events", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id: randomUUID(), license_id: databaseId, event_type: "issued", actor: "license-admin", details: { customerName, plan, edition, featureOverrides } }) });
    return { ok: true, token: issued.token, license: { ...issued.payload, customerName } };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "License issuance failed." }; }
}

export async function createOfflineActivationPackage(input: { licenseId: string; deviceId: string }) {
  if (!(await isAdmin())) return { ok: false, error: "UNAUTHORIZED" };
  const licenseId = clean(input.licenseId, 200); const deviceId = clean(input.deviceId, 128).toLowerCase();
  if (!licenseId || !/^[a-f0-9]{64}$/.test(deviceId)) return { ok: false, error: "A valid license ID and 64-character device ID are required." };
  const privateKey = privateKeyHex(); if (!/^[0-9a-f]{64}$/.test(privateKey)) return { ok: false, error: "LICENSE_PRIVATE_KEY is not configured on the admin server." };
  const found = await dbFetch(`/licenses?select=id%2Clicense_id%2Ctoken%2Cstatus%2Cexpires_at%2Cactivation_limit%2Cplan&license_id=eq.${encodeURIComponent(licenseId)}&limit=1`);
  if (!found.ok) return { ok: false, error: found.error }; const license = found.data?.[0]; if (!license) return { ok: false, error: "License not found." };
  if (license.status !== "active") return { ok: false, error: `License is ${license.status}; offline activation is allowed only for active licenses.` };
  if (license.expires_at && new Date(license.expires_at).getTime() <= Date.now()) return { ok: false, error: "License has already expired." };
  const activationResult = await dbFetch("/rpc/activate_license_device", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ p_license_id: license.id, p_device_id: deviceId }) });
  if (!activationResult.ok) { if (String(activationResult.error || "").includes("ACTIVATION_LIMIT_REACHED")) return { ok: false, error: "Activation limit reached. Deactivate or replace an existing device first." }; if (String(activationResult.error || "").includes("LICENSE_EXPIRED")) return { ok: false, error: "License has already expired." }; return { ok: false, error: activationResult.error || "Offline activation failed." }; }
  const activation = Array.isArray(activationResult.data) ? activationResult.data[0] : null; const activationId = String(activation?.activation_id || ""); const activationRowId = String(activation?.activation_row_id || "");
  if (!activationId || !/^[a-f0-9-]{36}$/i.test(activationRowId)) return { ok: false, error: "Offline activation response was invalid." };
  const issuedAt = new Date().toISOString(); const certificate = await signActivationCertificate({ type: "minarvabiz-activation-v1", licenseId: license.license_id, activationId, deviceId, issuedAt, expiresAt: license.expires_at || null }, privateKey);
  const packageData = { format: "minarvabiz-license-v1", product: "minarvabiz", licenseToken: license.token, activationCertificate: certificate, licenseId: license.license_id, activationId, deviceId, issuedAt, expiresAt: license.expires_at || null };
  await dbFetch("/license_events", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id: randomUUID(), license_id: license.id, activation_id: activationRowId, event_type: "activated", device_id: deviceId, actor: "license-admin-offline", details: { mode: "offline-package-created" } }) });
  return { ok: true, filename: `MinarvaBiz-${license.license_id}-${deviceId.slice(0, 8)}.lic`, content: JSON.stringify(packageData, null, 2), activationId };
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
