import * as ed from "@noble/ed25519";
import type { LicensePayload } from "@minarvabiz/types";

function toBase64Url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  const bin = String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(str: string): Uint8Array {
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "").replace(/\s/g, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  return bytes;
}
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const LICENSE_PLANS = new Set(["trial", "basic", "professional", "business", "enterprise"]);
const LICENSE_EDITIONS = new Set(["online", "offline", "hybrid"]);

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function isLicenseFeatures(value: unknown): value is LicensePayload["features"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every((flag) => typeof flag === "boolean");
}

function isLicensePayload(value: unknown): value is LicensePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  if (typeof payload.licenseId !== "string" || !payload.licenseId) return false;
  if (typeof payload.customerId !== "string" || !payload.customerId) return false;
  if (payload.product !== "minarvabiz") return false;
  if (typeof payload.edition !== "string" || !LICENSE_EDITIONS.has(payload.edition)) return false;
  if (typeof payload.plan !== "string" || !LICENSE_PLANS.has(payload.plan)) return false;
  if (!isLicenseFeatures(payload.features)) return false;
  if (!isIsoDate(payload.issuedAt)) return false;
  if (payload.expiresAt !== null && !isIsoDate(payload.expiresAt)) return false;
  if (typeof payload.activationLimit !== "number" || !Number.isSafeInteger(payload.activationLimit) || payload.activationLimit < 1) return false;
  if (!Array.isArray(payload.deviceBindings) || !payload.deviceBindings.every((binding) => typeof binding === "string" && /^[a-f0-9]{64}$/i.test(binding))) return false;
  if (payload.expiresAt !== null && new Date(payload.expiresAt).getTime() < new Date(payload.issuedAt).getTime()) return false;
  return true;
}

export async function signLicense(payload: LicensePayload, privateKeyHex: string): Promise<string> {
  const body = toBase64Url(JSON.stringify(payload));
  const signature = await ed.signAsync(new TextEncoder().encode(body), hexToBytes(privateKeyHex));
  return `${body}.${toBase64Url(signature)}`;
}
export async function verifyLicenseToken(token: string, publicKeyHex: string): Promise<LicensePayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    if (!body || !sig) return null;
    const valid = await ed.verifyAsync(fromBase64Url(sig), new TextEncoder().encode(body), hexToBytes(publicKeyHex));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as unknown;
    return isLicensePayload(payload) ? payload : null;
  } catch { return null; }
}
