/**
 * B1 native-only Ed25519 enrollment credential verifier.
 *
 * Staging primitive, NOT wired to permissions, IPC or financial replay.
 * Trust anchors, expected scope, revocations and clock evidence must come from
 * the main process after trusted enrollment; NEVER from renderer IPC payloads.
 */
import { createPublicKey, verify } from "node:crypto";
import { isVerifiedSyncRevocationSnapshot, type VerifiedSyncRevocationSnapshot } from "./sync-revocations";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const B64URL = /^[A-Za-z0-9_-]+$/;
const KEY_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const ROLES = new Set(["super_admin", "admin", "manager", "cashier", "tailor", "staff"]);
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");
const DOMAIN = "MINARVA-BIZ:B1:SYNC-DEVICE-AUTHORITY:v1:";
const MAX_TOKEN_LENGTH = 8192;
const MAX_BRANCHES = 128;
const MAX_CREDENTIAL_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_REVOCATION_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

type DeviceRole = "super_admin" | "admin" | "manager" | "cashier" | "tailor" | "staff";

export interface SignedDeviceAuthorityPayload {
  type: "minarvabiz-sync-device-authority-v1";
  version: 1;
  keyId: string;
  credentialId: string;
  orgId: string;
  deviceId: string;
  actorUserId: string;
  role: DeviceRole;
  allowedBranchIds: string[];
  issuedAtMs: number;
  notBeforeMs: number;
  expiresAtMs: number;
}

/** This symbol is intentionally private to the native module. */
const verifiedAuthority = Symbol("native-verified-sync-authority");
export type VerifiedDeviceAuthority = Omit<SignedDeviceAuthorityPayload, "allowedBranchIds"> & {
  readonly allowedBranchIds: ReadonlyArray<string>;
  readonly [verifiedAuthority]: true;
};

export interface DeviceAuthorityVerificationContext {
  /** Pin an enrollment-only key; do not reuse commercial license keys. */
  readonly trustedKeyId: string;
  readonly pinnedEd25519PublicKeyHex: string;
  /** Immutable expected values from native, authenticated storage, not UI. */
  readonly expectedOrgId: string;
  readonly expectedDeviceId: string;
  readonly expectedActorUserId: string;
  readonly expectedBranchId: string;
  /** Previously verified, durable local revocation snapshot. */
  /** Must be native-verified and read from trusted, persisted revocation state. */
  readonly revocationSnapshot: VerifiedSyncRevocationSnapshot;
  /** Persisted high-water time; prevents trivial wall-clock rollback. */
  readonly lastTrustedClockMs: number;
  readonly nowMs: number;
}

export type AuthorityVerificationResult =
  | { ok: true; authority: VerifiedDeviceAuthority }
  | { ok: false; code: "invalid_token" | "invalid_signature" | "scope_mismatch"
      | "expired" | "revoked" | "revocation_stale" | "clock_untrusted" };

function failure(code: Extract<AuthorityVerificationResult, { ok: false }>["code"]): AuthorityVerificationResult {
  return { ok: false, code };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function decodeCanonicalB64Url(text: string): Buffer | null {
  if (!B64URL.test(text) || text.length % 4 === 1) return null;
  const bytes = Buffer.from(text, "base64url");
  return bytes.length > 0 && bytes.toString("base64url") === text ? bytes : null;
}
function isFiniteMillisecond(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parsePayload(value: unknown): SignedDeviceAuthorityPayload | null {
  if (!isRecord(value)) return null;
  const expectedKeys = [
    "type", "version", "keyId", "credentialId", "orgId", "deviceId",
    "actorUserId", "role", "allowedBranchIds", "issuedAtMs",
    "notBeforeMs", "expiresAtMs",
  ];
  if (Object.keys(value).length !== expectedKeys.length ||
      expectedKeys.some(key => !Object.prototype.hasOwnProperty.call(value, key))) return null;
  if (value.type !== "minarvabiz-sync-device-authority-v1" || value.version !== 1 ||
      typeof value.keyId !== "string" || !KEY_ID.test(value.keyId) ||
      ![value.credentialId, value.orgId, value.deviceId, value.actorUserId].every(
        id => typeof id === "string" && UUID.test(id)
      ) ||
      typeof value.role !== "string" || !ROLES.has(value.role) ||
      !Array.isArray(value.allowedBranchIds) ||
      value.allowedBranchIds.length === 0 ||
      value.allowedBranchIds.length > MAX_BRANCHES ||
      !value.allowedBranchIds.every(id => typeof id === "string" && UUID.test(id)) ||
      ![value.issuedAtMs, value.notBeforeMs, value.expiresAtMs].every(isFiniteMillisecond)) {
    return null;
  }
  const branchIds = value.allowedBranchIds as string[];
  // Canonical order prevents duplicated or ambiguous branch grants.
  if (branchIds.some((id, index) => index > 0 && branchIds[index - 1] >= id)) return null;
  const issuedAtMs = value.issuedAtMs as number;
  const notBeforeMs = value.notBeforeMs as number;
  const expiresAtMs = value.expiresAtMs as number;
  if (notBeforeMs < issuedAtMs || expiresAtMs <= notBeforeMs ||
      expiresAtMs - issuedAtMs > MAX_CREDENTIAL_LIFETIME_MS) return null;
  return value as unknown as SignedDeviceAuthorityPayload;
}

/** No private keys or signature issuance happen inside desktop software. */
export function verifyNativeDeviceAuthority(
  token: unknown,
  context: DeviceAuthorityVerificationContext,
): AuthorityVerificationResult {
  if (typeof token !== "string" || token.length === 0 ||
      token.length > MAX_TOKEN_LENGTH) return failure("invalid_token");
  const pieces = token.split(".");
  if (pieces.length !== 2) return failure("invalid_token");
  const body = decodeCanonicalB64Url(pieces[0]);
  const signature = decodeCanonicalB64Url(pieces[1]);
  if (!body || !signature || signature.length !== 64 ||
      body.length > 4096) return failure("invalid_token");
  let payload: SignedDeviceAuthorityPayload | null;
  try {
    payload = parsePayload(JSON.parse(body.toString("utf8")) as unknown);
  } catch {
    return failure("invalid_token");
  }
  if (!payload) return failure("invalid_token");
  // Single canonical UTF-8 representation rejects duplicate JSON keys, escaped
  // alternate spellings and parser-dependent payload interpretations.
  const canonicalBody = JSON.stringify({
    type: payload.type, version: payload.version, keyId: payload.keyId,
    credentialId: payload.credentialId, orgId: payload.orgId,
    deviceId: payload.deviceId, actorUserId: payload.actorUserId,
    role: payload.role, allowedBranchIds: payload.allowedBranchIds,
    issuedAtMs: payload.issuedAtMs, notBeforeMs: payload.notBeforeMs,
    expiresAtMs: payload.expiresAtMs,
  });
  if (body.toString("utf8") !== canonicalBody) return failure("invalid_token");
  if (payload.keyId !== context.trustedKeyId ||
      !KEY_ID.test(context.trustedKeyId) ||
      !/^[0-9a-f]{64}$/i.test(context.pinnedEd25519PublicKeyHex)) {
    return failure("invalid_signature");
  }
  try {
    const publicKey = createPublicKey({
      key: Buffer.concat([SPKI_ED25519, Buffer.from(context.pinnedEd25519PublicKeyHex, "hex")]),
      format: "der",
      type: "spki",
    });
    if (!verify(null, Buffer.concat([Buffer.from(DOMAIN), Buffer.from(pieces[0], "utf8")]),
      publicKey, signature)) return failure("invalid_signature");
  } catch {
    return failure("invalid_signature");
  }
  if (!UUID.test(context.expectedOrgId) || !UUID.test(context.expectedDeviceId) ||
      !UUID.test(context.expectedActorUserId) || !UUID.test(context.expectedBranchId) ||
      payload.orgId !== context.expectedOrgId ||
      payload.deviceId !== context.expectedDeviceId ||
      payload.actorUserId !== context.expectedActorUserId ||
      !payload.allowedBranchIds.includes(context.expectedBranchId)) {
    return failure("scope_mismatch");
  }
  if (!isFiniteMillisecond(context.nowMs) ||
      !isFiniteMillisecond(context.lastTrustedClockMs) ||
      context.nowMs + MAX_CLOCK_SKEW_MS < context.lastTrustedClockMs) {
    return failure("clock_untrusted");
  }
  if (context.nowMs < payload.notBeforeMs || context.nowMs >= payload.expiresAtMs ||
      payload.issuedAtMs > context.nowMs + MAX_CLOCK_SKEW_MS) {
    return failure("expired");
  }
  const revocations = context.revocationSnapshot;
  if (!isVerifiedSyncRevocationSnapshot(revocations) ||
      revocations.orgId !== payload.orgId ||
      revocations.deviceId !== payload.deviceId ||
      context.nowMs < revocations.issuedAtMs ||
      context.nowMs >= revocations.expiresAtMs ||
      context.nowMs - revocations.issuedAtMs > MAX_REVOCATION_AGE_MS)
    return failure("revocation_stale");
  if (revocations.revokedCredentialIds.includes(payload.credentialId) ||
      revocations.revokedBranchIds.includes(context.expectedBranchId))
    return failure("revoked");

  const authority = Object.freeze({
    ...payload,
    allowedBranchIds: Object.freeze([...payload.allowedBranchIds]),
    [verifiedAuthority]: true as const,
  });
  return { ok: true, authority };
}
