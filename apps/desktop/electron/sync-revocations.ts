/**
 * B1 trusted revocation snapshot verification. Desktop native only.
 * A caller must persist a monotonic sequence outside renderer-controlled
 * storage before adopting a newer snapshot. Verification does not install
 * authority or enable financial replay.
 */
import { createPublicKey, verify } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;
const DOMAIN = "MINARVA-BIZ:B1:SYNC-REVOCATIONS:v1:";
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");
const MAX_ITEMS = 1000;
const MAX_TOKEN_CHARS = 128 * 1024;
const MAX_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface SyncRevocationPayload {
  readonly type: "minarvabiz-sync-revocations-v1";
  readonly version: 1;
  readonly keyId: string;
  readonly orgId: string;
  readonly deviceId: string;
  readonly sequence: number;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly revokedCredentialIds: ReadonlyArray<string>;
  readonly revokedBranchIds: ReadonlyArray<string>;
}
export interface VerifiedSyncRevocationSnapshot extends SyncRevocationPayload {
  /** Marker is purposely non-enumerable. Actual provenance uses a WeakSet. */
  readonly verified: true;
}

const authenticSnapshots = new WeakSet<object>();

export interface RevocationTrustContext {
  readonly trustedKeyId: string;
  readonly pinnedEd25519PublicKeyHex: string;
  readonly expectedOrgId: string;
  readonly expectedDeviceId: string;
  /** Monotonic sequence from durable native storage; current snapshot must advance it. */
  readonly lastAcceptedSequence: number;
  /** Trusted native high-water timestamp (must not be renderer-controlled). */
  readonly lastTrustedClockMs: number;
  readonly nowMs: number;
}
export type RevocationVerificationResult =
  | { ok: true; snapshot: VerifiedSyncRevocationSnapshot }
  | { ok: false; code: "malformed" | "invalid_signature" | "scope_mismatch"
    | "stale" | "replay" | "clock_untrusted" };

export function isVerifiedSyncRevocationSnapshot(value: unknown): value is VerifiedSyncRevocationSnapshot {
  return typeof value === "object" && value !== null && authenticSnapshots.has(value);
}

function fail(code: Extract<RevocationVerificationResult, {ok:false}>["code"]): RevocationVerificationResult {
  return { ok: false, code };
}
function numericTime(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function uuidList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_ITEMS &&
    value.every((v: unknown, i: number) =>
      typeof v === "string" && UUID.test(v) &&
      (i === 0 || (typeof value[i-1] === "string" && value[i-1] < v)));
}
function parse(value: unknown): SyncRevocationPayload | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const keys = ["type","version","keyId","orgId","deviceId","sequence",
    "issuedAtMs","expiresAtMs","revokedCredentialIds","revokedBranchIds"];
  if (Object.keys(o).length !== keys.length ||
      keys.some(k => !Object.prototype.hasOwnProperty.call(o,k))) return null;
  if (o.type !== "minarvabiz-sync-revocations-v1" || o.version !== 1 ||
      typeof o.keyId !== "string" || !KEY_ID.test(o.keyId) ||
      typeof o.orgId !== "string" || !UUID.test(o.orgId) ||
      typeof o.deviceId !== "string" || !UUID.test(o.deviceId) ||
      typeof o.sequence !== "number" || !Number.isSafeInteger(o.sequence) ||
      o.sequence < 1 || !numericTime(o.issuedAtMs) ||
      !numericTime(o.expiresAtMs) || !uuidList(o.revokedCredentialIds) ||
      !uuidList(o.revokedBranchIds)) return null;
  if (o.expiresAtMs <= o.issuedAtMs || o.expiresAtMs - o.issuedAtMs > MAX_LIFETIME_MS) return null;
  return o as unknown as SyncRevocationPayload;
}
function strictDecode(s: string): Buffer | null {
  if (!s || !B64URL.test(s) || s.length % 4 === 1) return null;
  const bytes = Buffer.from(s,"base64url");
  return bytes.length > 0 && bytes.toString("base64url") === s ? bytes : null;
}

/** Proof verification only: no file writes, scope adoption or remote mutations. */
export function verifyNativeSyncRevocations(
  token: unknown,
  trust: RevocationTrustContext,
): RevocationVerificationResult {
  if (typeof token !== "string" || token.length > MAX_TOKEN_CHARS) return fail("malformed");
  const chunks = token.split(".");
  if (chunks.length !== 2) return fail("malformed");
  const body = strictDecode(chunks[0]), signature = strictDecode(chunks[1]);
  if (!body || !signature || signature.length !== 64 || body.length > 100_000) return fail("malformed");
  let payload: SyncRevocationPayload | null;
  try {
    payload = parse(JSON.parse(body.toString("utf8")) as unknown);
  } catch {
    return fail("malformed");
  }
  if (!payload) return fail("malformed");
  // JSON must be strictly canonical, including key order and no duplicate keys.
  const canonical = JSON.stringify({
    type: payload.type,version: payload.version,keyId: payload.keyId,
    orgId: payload.orgId,deviceId: payload.deviceId,sequence: payload.sequence,
    issuedAtMs: payload.issuedAtMs,expiresAtMs: payload.expiresAtMs,
    revokedCredentialIds: payload.revokedCredentialIds,
    revokedBranchIds: payload.revokedBranchIds,
  });
  if (body.toString("utf8") !== canonical) return fail("malformed");
  if (payload.keyId !== trust.trustedKeyId || !KEY_ID.test(trust.trustedKeyId) ||
      !/^[0-9a-f]{64}$/i.test(trust.pinnedEd25519PublicKeyHex)) return fail("invalid_signature");
  try {
    const publicKey = createPublicKey({
      key: Buffer.concat([SPKI_ED25519,Buffer.from(trust.pinnedEd25519PublicKeyHex,"hex")]),
      format:"der",type:"spki",
    });
    if (!verify(null,Buffer.from(DOMAIN+chunks[0],"utf8"),publicKey,signature))
      return fail("invalid_signature");
  } catch {
    return fail("invalid_signature");
  }
  if (!UUID.test(trust.expectedOrgId) || !UUID.test(trust.expectedDeviceId) ||
      trust.expectedOrgId !== payload.orgId || trust.expectedDeviceId !== payload.deviceId)
    return fail("scope_mismatch");
  if (!numericTime(trust.nowMs) || !numericTime(trust.lastTrustedClockMs) ||
      trust.nowMs + CLOCK_SKEW_MS < trust.lastTrustedClockMs)
    return fail("clock_untrusted");
  if (payload.issuedAtMs > trust.nowMs + CLOCK_SKEW_MS ||
      trust.nowMs < payload.issuedAtMs || trust.nowMs >= payload.expiresAtMs)
    return fail("stale");
  if (!Number.isSafeInteger(trust.lastAcceptedSequence) || trust.lastAcceptedSequence < 0 ||
      payload.sequence <= trust.lastAcceptedSequence)
    return fail("replay");

  const snapshot: VerifiedSyncRevocationSnapshot = Object.freeze({
    ...payload,
    revokedCredentialIds: Object.freeze([...payload.revokedCredentialIds]),
    revokedBranchIds: Object.freeze([...payload.revokedBranchIds]),
    verified: true as const,
  });
  authenticSnapshots.add(snapshot);
  return { ok:true, snapshot };
}
