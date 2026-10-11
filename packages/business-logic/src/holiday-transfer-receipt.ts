import { validateHolidayCache } from "./holiday-cache";
import type { HolidayRule } from "./holiday-calendar";

/**
 * HR-005 source-only verification of a server-signed holiday snapshot receipt.
 * There is deliberately NO call to hydrateHolidayCache or any Cloud/SQLite
 * write. The trusted key, session-bound tenant/device identity, complete RLS
 * snapshot and durable consumed-receipt ledger must be provided externally.
 * Receipt verification alone is NOT permission to import, sync or replay.
 */
export interface HolidayTransferReceipt {
  orgId: string;
  deviceId: string;
  receiptId: string;
  issuedAt: string;
  expiresAt: string;
  snapshotSha256: string;
}

const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const exactUtc = (value: unknown): value is string => {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
    return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
};

function checkedReceipt(value: unknown): HolidayTransferReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Holiday transfer receipt is malformed");
  const receipt = value as Record<string, unknown>;
  const fields = ["orgId", "deviceId", "receiptId", "issuedAt", "expiresAt", "snapshotSha256"];
  if (Object.keys(receipt).length !== fields.length ||
      Object.keys(receipt).some(key => !fields.includes(key)) ||
      !uuid(receipt.orgId) || !uuid(receipt.deviceId) ||
      !uuid(receipt.receiptId) || !exactUtc(receipt.issuedAt) ||
      !exactUtc(receipt.expiresAt) ||
      typeof receipt.snapshotSha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(receipt.snapshotSha256))
    throw Error("Holiday transfer receipt identity, time or digest invalid");
  return {
    orgId: receipt.orgId, deviceId: receipt.deviceId,
    receiptId: receipt.receiptId, issuedAt: receipt.issuedAt,
    expiresAt: receipt.expiresAt, snapshotSha256: receipt.snapshotSha256
  };
}

/** Canonical, domain-separated wire format; do not change after rollout. */
export function holidayTransferSigningBytes(receipt: HolidayTransferReceipt): Uint8Array {
  const r = checkedReceipt(receipt);
  return new TextEncoder().encode([
    "minarvabiz.hr005.holiday-snapshot.v1",
    r.orgId, r.deviceId, r.receiptId, r.issuedAt, r.expiresAt,
    r.snapshotSha256
  ].join("\n"));
}

/** Stable full-snapshot SHA-256. This digest provides integrity, not origin. */
export async function holidaySnapshotDigest(snapshot: readonly HolidayRule[]): Promise<string> {
  const rules = validateHolidayCache(snapshot);
  if (!globalThis.crypto?.subtle)
    throw Error("Platform secure crypto unavailable for holiday transfer review");
  const encoded = new TextEncoder().encode(JSON.stringify(rules));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

function signatureBytes(signature: unknown): Uint8Array {
  if (typeof signature !== "string" ||
      !/^[A-Za-z0-9_-]{86}$/.test(signature))
    throw Error("Invalid holiday receipt signature encoding");
  let binary: string;
  try { binary = atob(signature.replace(/-/g, "+").replace(/_/g, "/") + "=="); }
  catch { throw Error("Invalid holiday receipt signature bytes"); }
  if (binary.length !== 64)
    throw Error("Invalid holiday receipt signature length");
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

/**
 * Fail-closed device preflight. Signature is P-256 ECDSA SHA-256 (raw R||S).
 * Input key MUST be an independently pinned trusted server public key.
 * consumedReceiptIds MUST reflect a durable authoritative ledger; this
 * helper does not persist/consume a receipt and never grants import authority.
 */
export async function verifyHolidayTransferReceipt(input: {
  receipt: unknown;
  signature: string;
  trustedPublicKey: CryptoKey;
  expectedOrgId: string;
  expectedDeviceId: string;
  snapshot: readonly HolidayRule[];
  nowEpochMs: number;
  consumedReceiptIds: ReadonlySet<string>;
}): Promise<HolidayTransferReceipt> {
  if (!input || !uuid(input.expectedOrgId) || !uuid(input.expectedDeviceId) ||
      !Number.isSafeInteger(input.nowEpochMs) ||
      !input.consumedReceiptIds ||
      typeof input.consumedReceiptIds.has !== "function")
    throw Error("Verified organization, device, time and consumed receipt context required");
  if (!globalThis.crypto?.subtle)
    throw Error("Platform secure crypto unavailable for holiday transfer review");

  const r = checkedReceipt(input.receipt);
  if (r.orgId !== input.expectedOrgId || r.deviceId !== input.expectedDeviceId)
    throw Error("Holiday receipt bound to another tenant or device");
  const issued = Date.parse(r.issuedAt), expires = Date.parse(r.expiresAt);
  if (issued > input.nowEpochMs + 60_000 ||
      expires <= input.nowEpochMs ||
      expires <= issued || expires - issued > 15 * 60_000)
    throw Error("Holiday receipt is future-dated, expired or outside the 15-minute window");
  if (input.consumedReceiptIds.has(r.receiptId))
    throw Error("Holiday receipt already consumed; transfer replay refused");

  const key = input.trustedPublicKey;
  const algo = key?.algorithm as EcKeyAlgorithm | undefined;
  if (key?.type !== "public" || !key.usages.includes("verify") ||
      algo?.name !== "ECDSA" || algo.namedCurve !== "P-256")
    throw Error("Trusted P-256 holiday receipt verification key required");
  const rows = validateHolidayCache(input.snapshot);
  for (const row of rows)
    if (row.orgId !== input.expectedOrgId)
      throw Error("Holiday snapshot belongs to a different tenant");
  if (await holidaySnapshotDigest(rows) !== r.snapshotSha256)
    throw Error("Holiday transfer snapshot digest mismatch");
  const sig = signatureBytes(input.signature);
  const valid = await globalThis.crypto.subtle.verify(
    {name: "ECDSA", hash: "SHA-256"}, key, sig, holidayTransferSigningBytes(r)
  );
  if (!valid)
    throw Error("Holiday receipt signature not verified");
  // Deliberately no import, cache hydration, replay, receipt consumption, or writes.
  return {...r};
}
