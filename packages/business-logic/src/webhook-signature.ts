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
