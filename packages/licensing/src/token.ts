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
export async function signLicense(payload: LicensePayload, privateKeyHex: string): Promise<string> {
  const body = toBase64Url(JSON.stringify(payload));
  const signature = await ed.signAsync(new TextEncoder().encode(body), hexToBytes(privateKeyHex));
  return `${body}.${toBase64Url(signature)}`;
}
export async function verifyLicenseToken(token: string, publicKeyHex: string): Promise<LicensePayload | null> {
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const valid = await ed.verifyAsync(fromBase64Url(sig), new TextEncoder().encode(body), hexToBytes(publicKeyHex));
    if (!valid) return null;
    return JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as LicensePayload;
  } catch { return null; }
}
