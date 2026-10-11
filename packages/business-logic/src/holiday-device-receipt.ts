import { validateHolidayCache } from "./holiday-cache";
import type { HolidayRule } from "./holiday-calendar";

/**
 * HR-005: Verify a server-signed, device-addressed holiday SNAPSHOT before a
 * future authorized Windows intake. This module NEVER hydrates local cache,
 * accepts Cloud writes, creates receipts or approves offline replay.
 *
 * TRUST BOUNDARY: the Ed25519 public key MUST be pinned by the host from a
 * verified organization/service configuration. It must NOT come from the
 * untrusted packet or arbitrary remote content.
 */
export interface HolidayDeviceSnapshot {
  schemaVersion: 1;
  snapshotId: string;
  orgId: string;
  deviceId: string;
  sequence: number;
  issuedAt: number; // trusted server Unix milliseconds
  expiresAt: number;
  rules: HolidayRule[];
}
export interface SignedHolidayDeviceSnapshot {
  payload: HolidayDeviceSnapshot;
  signatureBase64: string; // Ed25519 detached signature over canonical bytes
}
export interface VerifiedHolidayDeviceSnapshot {
  snapshotId: string;
  orgId: string;
  deviceId: string;
  sequence: number;
  rules: HolidayRule[];
}

const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const PREFIX = "MINARVABIZ/HR005/HOLIDAY-DEVICE-SNAPSHOT/V1\n";
const MAX_RECEIPT_LIFETIME_MS = 15 * 60_000;
const MAX_CLOCK_SKEW_MS = 60_000;

function canonicalSnapshot(value: unknown): HolidayDeviceSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid signed holiday snapshot");
  const packet = value as Record<string, unknown>;
  if (packet.schemaVersion !== 1 ||
      !uuid(packet.snapshotId) || !uuid(packet.orgId) || !uuid(packet.deviceId) ||
      !Number.isSafeInteger(packet.sequence as number) || (packet.sequence as number) < 1 ||
      !Number.isSafeInteger(packet.issuedAt as number) ||
      !Number.isSafeInteger(packet.expiresAt as number) ||
      (packet.expiresAt as number) <= (packet.issuedAt as number) ||
      (packet.expiresAt as number) - (packet.issuedAt as number) > MAX_RECEIPT_LIFETIME_MS)
    throw Error("Invalid signed holiday snapshot identity, sequence or lifetime");
  const rules = validateHolidayCache(packet.rules);
  if (rules.some(rule => rule.orgId !== packet.orgId))
    throw Error("Cross-tenant holiday device snapshot refused");
  // Rebuild with strictly fixed field order and validated, sorted rule
  // records. Caller-owned objects/prototypes cannot affect signature bytes.
  return {
    schemaVersion: 1, snapshotId: packet.snapshotId as string,
    orgId: packet.orgId as string, deviceId: packet.deviceId as string,
    sequence: packet.sequence as number,
    issuedAt: packet.issuedAt as number, expiresAt: packet.expiresAt as number,
    rules
  };
}

/** Shared canonical encoding for a future audited server signer and tests. */
export function holidayDeviceSnapshotSigningBytes(payload: unknown): Uint8Array {
  return new TextEncoder().encode(PREFIX + JSON.stringify(canonicalSnapshot(payload)));
}

function strictBase64(value: unknown): Uint8Array {
  if (typeof value !== "string" ||
      !/^[A-Za-z0-9+/]{86}==$/.test(value))
    throw Error("Invalid detached holiday receipt signature encoding");
  const decoded = atob(value);
  if (decoded.length !== 64)
    throw Error("Invalid Ed25519 holiday receipt signature length");
  return Uint8Array.from(decoded, ch => ch.charCodeAt(0));
}

/**
 * A source-only cryptographic preflight. Both the host's current tenant AND
 * device identities must match the signed envelope; the durable last-accepted
 * sequence must be provided from the device's protected persisted state.
 * Calls without that state, a trusted key or genuine crypto must fail closed.
 *
 * Authentication and receipt issuance remain server-side future milestones.
 * A positive result alone NEVER authorizes a write to SQLite or Cloud.
 */
export async function verifyHolidayDeviceSnapshot(input: {
  packet: SignedHolidayDeviceSnapshot;
  expectedOrgId: string;
  expectedDeviceId: string;
  lastAcceptedSequence: number;
  nowMs: number;
  pinnedEd25519PublicKey: Uint8Array;
  subtle: SubtleCrypto;
}): Promise<VerifiedHolidayDeviceSnapshot> {
  if (!input || !uuid(input.expectedOrgId) || !uuid(input.expectedDeviceId) ||
      !Number.isSafeInteger(input.lastAcceptedSequence) ||
      input.lastAcceptedSequence < 0 ||
      !Number.isSafeInteger(input.nowMs) ||
      !(input.pinnedEd25519PublicKey instanceof Uint8Array) ||
      input.pinnedEd25519PublicKey.length !== 32 ||
      !input.subtle || typeof input.subtle.importKey !== "function" ||
      typeof input.subtle.verify !== "function")
    throw Error("Trusted tenant, device, persisted sequence, clock, key and WebCrypto required");
  if (!input.packet || typeof input.packet !== "object")
    throw Error("Signed holiday receipt packet required");
  const payload = canonicalSnapshot(input.packet.payload);
  if (payload.orgId !== input.expectedOrgId ||
      payload.deviceId !== input.expectedDeviceId)
    throw Error("Holiday receipt destination tenant/device mismatch");
  if (payload.sequence <= input.lastAcceptedSequence)
    throw Error("Holiday device receipt replay or stale sequence refused");
  if (payload.issuedAt > input.nowMs + MAX_CLOCK_SKEW_MS ||
      payload.expiresAt < input.nowMs)
    throw Error("Holiday receipt expired or from an untrusted future clock");
  const signature = strictBase64(input.packet.signatureBase64);
  const key = await input.subtle.importKey(
    "raw", input.pinnedEd25519PublicKey, "Ed25519", false, ["verify"]);
  const accepted = await input.subtle.verify(
    "Ed25519", key, signature,
    holidayDeviceSnapshotSigningBytes(payload));
  if (!accepted)
    throw Error("Holiday receipt Ed25519 signature verification failed");
  return {
    snapshotId: payload.snapshotId, orgId: payload.orgId,
    deviceId: payload.deviceId, sequence: payload.sequence,
    rules: payload.rules.map(rule => ({...rule}))
  };
}
