import { createPrivateKey, createPublicKey, sign } from "node:crypto";

const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

function signingSeed(): Buffer {
  const raw = String(process.env.LICENSE_PRIVATE_KEY || "").trim();
  if (!raw) throw new Error("LICENSE_PRIVATE_KEY is not configured.");

  const compact = raw.replace(/^0x/i, "").replace(/\s/g, "");
  if (/^[0-9a-f]{64}$/i.test(compact)) return Buffer.from(compact, "hex");

  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;

  throw new Error("LICENSE_PRIVATE_KEY must be a 32-byte Ed25519 seed encoded as 64 hex characters or base64.");
}

export function privateKeyHex(): string {
  try {
    return signingSeed().toString("hex");
  } catch {
    return "";
  }
}

export function publicKeyHex(): string {
  const seed = signingSeed();
  const pkcs8 = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
  const privateKey = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
  const spki = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  return Buffer.from(spki).subarray(-32).toString("hex");
}


export function signTextBase64Url(message: string): string {
  const seed = signingSeed();
  const pkcs8 = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
  const privateKey = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
  return sign(null, Buffer.from(message, "utf8"), privateKey).toString("base64url");
}
