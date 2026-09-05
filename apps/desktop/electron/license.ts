import { app, ipcMain, safeStorage } from "electron";
import * as fs from "fs";
import * as path from "path";
import { createPublicKey, randomUUID, verify } from "crypto";

type LicensePlan = "trial" | "basic" | "professional" | "business" | "enterprise";
type LicenseEdition = "online" | "offline" | "hybrid";
type LicenseFeatures = Record<string, boolean>;
type LicensePayload = { licenseId: string; customerId: string; product: "minarvabiz"; edition: LicenseEdition; plan: LicensePlan; features: LicenseFeatures; issuedAt: string; expiresAt: string | null; activationLimit: number; deviceBindings: string[] };
type StoredCommercialLicense = { token: string; activationId: string; deviceId: string; activatedAt: string; lastOnlineValidation: string | null };

export type DesktopLicenseState = { status: "unlicensed" | "active" | "grace" | "expired" | "invalid"; plan: LicensePlan | null; edition: LicenseEdition | null; features: LicenseFeatures | null; daysRemaining: number | null; graceDaysRemaining: number | null; reason?: string; licenseId?: string; activationId?: string };

const LICENSE_FILE = "commercial-license.bin";
const GRACE_DAYS: Record<LicensePlan, number> = { trial: 0, basic: 7, professional: 7, business: 14, enterprise: 30 };

function filePath() { return path.join(app.getPath("userData"), LICENSE_FILE); }
function publicKeyHex() { return String(process.env.MINARVA_LICENSE_PUBLIC_KEY_HEX || process.env.LICENSE_PUBLIC_KEY || "").replace(/^0x/, "").replace(/\s/g, "").toLowerCase(); }
function hexToBytes(hex: string) { const out = Buffer.alloc(hex.length / 2); for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16); return out; }
function fromBase64Url(value: string) { return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4), "base64"); }
function verifyToken(token: string, keyHex: string): LicensePayload | null { try { const [body, signature] = token.split("."); if (!body || !signature || !/^[0-9a-f]{64}$/.test(keyHex)) return null; const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), hexToBytes(keyHex)]), format: "der", type: "spki" }); if (!verify(null, Buffer.from(body, "utf8"), publicKey, fromBase64Url(signature))) return null; const payload = JSON.parse(fromBase64Url(body).toString("utf8")) as LicensePayload; if (payload.product !== "minarvabiz" || !payload.licenseId || !payload.customerId || !Array.isArray(payload.deviceBindings) || !payload.features) return null; return payload; } catch { return null; } }
function readStored(): StoredCommercialLicense | null { try { if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(filePath())) return null; return JSON.parse(safeStorage.decryptString(fs.readFileSync(filePath()))) as StoredCommercialLicense; } catch { return null; } }
function writeStored(value: StoredCommercialLicense) { if (!safeStorage.isEncryptionAvailable()) throw new Error("OS secure storage is unavailable"); fs.mkdirSync(app.getPath("userData"), { recursive: true }); const temp = `${filePath()}.tmp-${process.pid}-${Date.now()}`; fs.writeFileSync(temp, safeStorage.encryptString(JSON.stringify(value))); fs.renameSync(temp, filePath()); }
function clearStored() { try { if (fs.existsSync(filePath())) fs.unlinkSync(filePath()); } catch {} }
function daysBetween(ms: number) { return Math.max(0, Math.ceil(ms / 86400000)); }

export async function getDesktopLicenseState(deviceId: string): Promise<DesktopLicenseState> {
  const stored = readStored();
  if (!stored) return { status: "unlicensed", plan: null, edition: null, features: null, daysRemaining: null, graceDaysRemaining: null, reason: "No commercial license activated" };
  const key = publicKeyHex();
  if (!/^[0-9a-f]{64}$/.test(key)) return { status: "invalid", plan: null, edition: null, features: null, daysRemaining: null, graceDaysRemaining: null, reason: "Commercial license verification key is not configured" };
  if (stored.deviceId !== deviceId) return { status: "invalid", plan: null, edition: null, features: null, daysRemaining: null, graceDaysRemaining: null, reason: "This license is bound to another device", activationId: stored.activationId };
  const payload = verifyToken(stored.token, key);
  if (!payload) return { status: "invalid", plan: null, edition: null, features: null, daysRemaining: null, graceDaysRemaining: null, reason: "Invalid signature or malformed license token", activationId: stored.activationId };
  if (payload.deviceBindings.length > 0 && !payload.deviceBindings.includes(deviceId)) return { status: "invalid", plan: payload.plan, edition: payload.edition, features: null, daysRemaining: null, graceDaysRemaining: null, reason: "Device not activated for this license", licenseId: payload.licenseId, activationId: stored.activationId };
  const now = Date.now();
  const expires = payload.expiresAt ? new Date(payload.expiresAt).getTime() : null;
  if (expires !== null && (!Number.isFinite(expires) || expires <= now)) {
    const graceDays = GRACE_DAYS[payload.plan] ?? 0;
    const lastOnline = stored.lastOnlineValidation ? new Date(stored.lastOnlineValidation).getTime() : NaN;
    const graceUntil = Number.isFinite(lastOnline) ? lastOnline + graceDays * 86400000 : 0;
    if (graceDays > 0 && now <= graceUntil) return { status: "grace", plan: payload.plan, edition: payload.edition, features: payload.features, daysRemaining: 0, graceDaysRemaining: daysBetween(graceUntil - now), reason: "License expired — offline grace period active", licenseId: payload.licenseId, activationId: stored.activationId };
    return { status: "expired", plan: payload.plan, edition: payload.edition, features: null, daysRemaining: 0, graceDaysRemaining: 0, reason: "License expired and grace period ended", licenseId: payload.licenseId, activationId: stored.activationId };
  }
  return { status: "active", plan: payload.plan, edition: payload.edition, features: payload.features, daysRemaining: expires === null ? null : daysBetween(expires - now), graceDaysRemaining: null, licenseId: payload.licenseId, activationId: stored.activationId };
}

export async function activateDesktopLicense(token: string, deviceId: string): Promise<DesktopLicenseState> {
  const clean = String(token || "").trim(); const key = publicKeyHex();
  if (!clean) return { status: "invalid", plan: null, edition: null, features: null, daysRemaining: null, graceDaysRemaining: null, reason: "License token is required" };
  if (!/^[0-9a-f]{64}$/.test(key)) return { status: "invalid", plan: null, edition: null, features: null, daysRemaining: null, graceDaysRemaining: null, reason: "Commercial license verification key is not configured" };
  const payload = verifyToken(clean, key);
  if (!payload) return { status: "invalid", plan: null, edition: null, features: null, daysRemaining: null, graceDaysRemaining: null, reason: "Invalid signature or malformed license token" };
  if (payload.deviceBindings.length > 0 && !payload.deviceBindings.includes(deviceId)) return { status: "invalid", plan: payload.plan, edition: payload.edition, features: null, daysRemaining: null, graceDaysRemaining: null, reason: "This license is not bound to this Windows device" };
  try { writeStored({ token: clean, activationId: randomUUID(), deviceId, activatedAt: new Date().toISOString(), lastOnlineValidation: new Date().toISOString() }); } catch (e) { return { status: "invalid", plan: null, edition: null, features: null, daysRemaining: null, graceDaysRemaining: null, reason: e instanceof Error ? e.message : String(e) }; }
  return getDesktopLicenseState(deviceId);
}

export function deactivateDesktopLicense() { clearStored(); return true; }
export function registerDesktopLicenseIpc(getDeviceId: () => string) { ipcMain.handle("license:getState", () => getDesktopLicenseState(getDeviceId())); ipcMain.handle("license:activateToken", (_event, token: string) => activateDesktopLicense(token, getDeviceId())); ipcMain.handle("license:deactivate", () => deactivateDesktopLicense()); }
