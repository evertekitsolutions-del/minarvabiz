/** Server-issued device activation certificate.
 * The license token remains immutable; this certificate binds one activation to one device.
 * Private signing keys must remain server/admin-side. Clients only verify the certificate.
 */

import * as ed from "@noble/ed25519";

export interface ActivationCertificatePayload {
  type: "minarvabiz-activation-v1";
  licenseId: string;
  activationId: string;
  deviceId: string;
  issuedAt: string;
  expiresAt: string | null;
}

function toBase64Url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const bin = String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "").replace(/\s/g, "");
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) throw new Error("Invalid hex key");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export async function signActivationCertificate(payload: ActivationCertificatePayload, privateKeyHex: string): Promise<string> {
  const body = toBase64Url(JSON.stringify(payload));
  const signature = await ed.signAsync(new TextEncoder().encode(body), hexToBytes(privateKeyHex));
  return `${body}.${toBase64Url(signature)}`;
}

export async function verifyActivationCertificate(token: string, publicKeyHex: string): Promise<ActivationCertificatePayload | null> {
  try {
    const [body, signature] = token.split(".");
    if (!body || !signature) return null;
    const valid = await ed.verifyAsync(fromBase64Url(signature), new TextEncoder().encode(body), hexToBytes(publicKeyHex));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as ActivationCertificatePayload;
    if (payload.type !== "minarvabiz-activation-v1" || !payload.licenseId || !payload.activationId || !/^[a-f0-9]{64}$/.test(payload.deviceId)) return null;
    return payload;
  } catch { return null; }
}
