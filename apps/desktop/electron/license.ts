import { app, ipcMain, safeStorage } from "electron";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { validateLicenseLocally, type LicensePayload } from "@minarvabiz/licensing";
import { PLAN_LIMITS } from "@minarvabiz/licensing";

const LICENSE_FILE = "commercial-license.bin";

type StoredCommercialLicense = {
  token: string;
  activationId: string;
  deviceId: string;
  activatedAt: string;
  lastOnlineValidation: string | null;
};

export type DesktopLicenseState = {
  status: "unlicensed" | "active" | "grace" | "expired" | "invalid";
  plan: LicensePayload["plan"] | null;
  edition: LicensePayload["edition"] | null;
  features: LicensePayload["features"] | null;
  daysRemaining: number | null;
  graceDaysRemaining: number | null;
  reason?: string;
  licenseId?: string;
  activationId?: string;
};

function filePath() { return path.join(app.getPath("userData"), LICENSE_FILE); }
function publicKeyHex() { return String(process.env.MINARVA_LICENSE_PUBLIC_KEY_HEX || "").replace(/^0x/, "").replace(/\s/g, "").toLowerCase(); }

function readStored(): StoredCommercialLicense | null {
  try {
    if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(filePath())) return null;
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(filePath()))) as StoredCommercialLicense;
  } catch { return null; }
}

function writeStored(value: StoredCommercialLicense) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("OS secure storage is unavailable");
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  const temp = `${filePath()}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, safeStorage.encryptString(JSON.stringify(value)));
  fs.renameSync(temp, filePath());
}

function clearStored() {
  try { if (fs.existsSync(filePath())) fs.unlinkSync(filePath()); } catch { /* best effort */ }
}

function daysBetween(ms: number) { return Math.max(0, Math.ceil(ms / 86400000)); }

export async function getDesktopLicenseState(deviceId: string): Promise<DesktopLicenseState> {
  const stored = readStored();
  if (!stored) return { status: "unlicensed", plan: null, edition: null, features: null, daysRemaining: null, graceDaysRemaining: null, reason: "No commercial license activated" };
  const key = publicKeyHex();
  if (!/^[0-9a-f]{64}$/.test(key)) return { status: "invalid", plan: null, edition: null, features: null, daysRemaining: null, graceDaysRemaining: null, reason: "Commercial license verification key is not configured" };
  if (stored.deviceId !== deviceId) return { status: "invalid", plan: null, edition: null, features: null, daysRemaining: null, graceDaysRemaining: null, reason: "This license is bound to another device", activationId: stored.activationId };

  const result = await validateLicenseLocally(stored.token, key, deviceId, {
    graceDays: 0,
    lastOnlineValidation: stored.lastOnlineValidation ?? undefined,
  });
  if (!result.payload) return { status: "invalid", plan: null, edition: null, features: null, daysRemaining: null, graceDaysRemaining: null, reason: result.reason, activationId: stored.activationId };
  const payload = result.payload;
  const now = Date.now();
  const expires = payload.expiresAt ? new Date(payload.expiresAt).getTime() : null;
  if (expires !== null && (!Number.isFinite(expires) || expires <= now)) {
    const graceDays = PLAN_LIMITS[payload.plan]?.graceDays ?? 7;
    const lastOnline = stored.lastOnlineValidation ? new Date(stored.lastOnlineValidation).getTime() : NaN;
    const graceUntil = Number.isFinite(lastOnline) ? lastOnline + graceDays * 86400000 : 0;
    if (graceDays > 0 && now <= graceUntil) {
      return { status: "grace", plan: payload.plan, edition: payload.edition, features: payload.features, daysRemaining: 0, graceDaysRemaining: daysBetween(graceUntil - now), reason: "License expired — offline grace period active", licenseId: payload.licenseId, activationId: stored.activationId };
    }
    return { status: "expired", plan: payload.plan, edition: payload.edition, features: null, daysRemaining: 0, graceDaysRemaining: 0, reason: "License expired and grace period ended", licenseId: payload.licenseId, activationId: stored.activationId };
  }
  return { status: "active", plan: payload.plan, edition: payload.edition, features: payload.features, daysRemaining: expires === null ? null : daysBetween(expires - now), graceDaysRemaining: null, licenseId: payload.licenseId, activationId: stored.activationId };
}

export async function activateDesktopLicense(token: string, deviceId: string): Promise<DesktopLicenseState> {
  const clean = String(token || "").trim();
  if (!clean) return { status: "invalid", plan: null, edition: null, features: null, daysRemaining: null, graceDaysRemaining: null, reason: "License token is required" };
  const key = publicKeyHex();
  if (!/^[0-9a-f]{64}$/.test(key)) return { status: "invalid", plan: null, edition: null, features: null, daysRemaining: null, graceDaysRemaining: null, reason: "Commercial license verification key is not configured" };
  const result = await validateLicenseLocally(clean, key, deviceId, { graceDays: 0 });
  if (!result.valid || !result.payload) return { status: "invalid", plan: null, edition: null, features: null, daysRemaining: null, graceDaysRemaining: null, reason: result.reason || "License verification failed" };
  const stored: StoredCommercialLicense = { token: clean, activationId: randomUUID(), deviceId, activatedAt: new Date().toISOString(), lastOnlineValidation: new Date().toISOString() };
  try { writeStored(stored); } catch (e) { return { status: "invalid", plan: null, edition: null, features: null, daysRemaining: null, graceDaysRemaining: null, reason: e instanceof Error ? e.message : String(e) }; }
  return getDesktopLicenseState(deviceId);
}

export function deactivateDesktopLicense() {
  clearStored();
  return true;
}

export function registerDesktopLicenseIpc(getDeviceId: () => string) {
  ipcMain.handle("license:getState", () => getDesktopLicenseState(getDeviceId()));
  ipcMain.handle("license:activateToken", (_event, token: string) => activateDesktopLicense(token, getDeviceId()));
  ipcMain.handle("license:deactivate", () => deactivateDesktopLicense());
}
