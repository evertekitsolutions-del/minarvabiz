/** INT-002: deterministic signed webhook envelope. No network, secret persistence or dispatch. */
export interface WebhookSignedRequest {
  body: string;
  headers: Readonly<Record<string, string>>;
}
const encoder = new TextEncoder();
const HEX = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
/** Secret must be supplied by a privileged server-side vault, never a browser. */
export async function signWebhookDelivery(input: {
  eventId: string; eventType: string; payload: unknown; timestamp: number;
  secret: string; cryptoProvider?: Crypto;
}): Promise<WebhookSignedRequest> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.eventId) ||
      !/^[a-z]+(?:\.[a-z]+)+$/.test(input.eventType)) throw new Error("Invalid webhook event");
  if (!Number.isSafeInteger(input.timestamp) || input.timestamp <= 0) throw new Error("Invalid timestamp");
  if (typeof input.secret !== "string" || input.secret.length < 32) throw new Error("Invalid webhook secret");
  const provider = input.cryptoProvider ?? globalThis.crypto;
  if (!provider?.subtle) throw new Error("WebCrypto unavailable");
  const body = JSON.stringify({ id: input.eventId, type: input.eventType, created: input.timestamp, data: input.payload });
  if (typeof body !== "string" || encoder.encode(body).length > 262144) throw new Error("Invalid webhook payload");
  const signed = `${input.timestamp}.${body}`;
  const key = await provider.subtle.importKey("raw", encoder.encode(input.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await provider.subtle.sign("HMAC", key, encoder.encode(signed)));
  return { body, headers: {
    "content-type": "application/json",
    "x-minarva-event-id": input.eventId,
    "x-minarva-timestamp": String(input.timestamp),
    "x-minarva-signature": `v1=${HEX(mac)}`,
  } };
}

/** Verify a webhook at a receiving integration boundary. The caller must persist
 * event IDs for replay prevention; timestamp tolerance alone is not deduplication. */
export async function verifyWebhookDelivery(input: {
  body: string; timestamp: string; signature: string; secret: string;
  nowSeconds: number; toleranceSeconds?: number; cryptoProvider?: Crypto;
}): Promise<boolean> {
  const tolerance = input.toleranceSeconds ?? 300;
  if (!Number.isSafeInteger(tolerance) || tolerance < 0 || tolerance > 3600 ||
      !/^[0-9]{1,16}$/.test(input.timestamp) ||
      !/^v1=[a-f0-9]{64}$/.test(input.signature) ||
      typeof input.body !== "string" || encoder.encode(input.body).length > 262144 ||
      typeof input.secret !== "string" || input.secret.length < 32 ||
      !Number.isSafeInteger(input.nowSeconds)) return false;
  const ts = Number(input.timestamp);
  if (!Number.isSafeInteger(ts) || ts <= 0 || Math.abs(input.nowSeconds - ts) > tolerance) return false;
  const provider = input.cryptoProvider ?? globalThis.crypto;
  if (!provider?.subtle) return false;
  try {
    const key = await provider.subtle.importKey("raw", encoder.encode(input.secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const actual = new Uint8Array(await provider.subtle.sign("HMAC", key,
      encoder.encode(`${input.timestamp}.${input.body}`)));
    if (actual.length !== 32) return false;
    const supplied = input.signature.slice(3);
    let mismatch = 0;
    for (let i = 0; i < actual.length; i++) {
      mismatch |= actual[i] ^ Number.parseInt(supplied.slice(i * 2, i * 2 + 2), 16);
    }
    return mismatch === 0;
  } catch {
    // Receiver verification must fail closed if a crypto provider rejects.
    return false;
  }
}


/** Server-side rotation verifier: accepts the active key and, during a bounded
 * overlap window, one previous key. Never expose these keys to browser clients.
 * Replay protection remains the responsibility of the durable event-ID store. */
export async function verifyWebhookDeliveryWithRotation(input: {
  body: string; timestamp: string; signature: string;
  activeSecret: string; previousSecret?: string;
  previousKeyValidUntilSeconds?: number;
  nowSeconds: number; toleranceSeconds?: number; cryptoProvider?: Crypto;
}): Promise<boolean> {
  const common = {
    body: input.body, timestamp: input.timestamp, signature: input.signature,
    nowSeconds: input.nowSeconds, toleranceSeconds: input.toleranceSeconds,
    cryptoProvider: input.cryptoProvider,
  };
  if (await verifyWebhookDelivery({ ...common, secret: input.activeSecret })) return true;
  if (!input.previousSecret ||
      !Number.isSafeInteger(input.previousKeyValidUntilSeconds) ||
      !Number.isSafeInteger(input.nowSeconds) ||
      input.nowSeconds > input.previousKeyValidUntilSeconds!) return false;
  return verifyWebhookDelivery({ ...common, secret: input.previousSecret });
}
