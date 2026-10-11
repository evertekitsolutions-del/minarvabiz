import "server-only";
import { KeyObject, createPublicKey, sign, timingSafeEqual } from "node:crypto";
import { holidayDeviceReceipt } from "@minarvabiz/business-logic";

/**
 * HR-005K: SERVER-ONLY cryptographic signing primitive, NOT an issuance API.
 *
 * Callers MUST first independently authenticate the actor, authorize the
 * tenant/device under RLS, allocate a durable monotonic sequence, load the
 * COMPLETE snapshot, append a transactionally durable audit/receipt ledger
 * record and resolve key-rotation/revocation policy.
 *
 * None of those authorities is implemented or inferred by this function.
 * In particular, NEVER wire this directly to a client request or enable
 * production HR-005 flags merely because a valid signature can be created.
 */
export function signHolidaySnapshotDraftServerOnly(input: {
  payload: holidayDeviceReceipt.HolidayDeviceSnapshot;
  privateKey: KeyObject;
  expectedPinnedPublicKey: Uint8Array;
  trustedNowMs: number;
}): holidayDeviceReceipt.SignedHolidayDeviceSnapshot {
  if (!input || !(input.privateKey instanceof KeyObject) ||
      input.privateKey.type !== "private" ||
      input.privateKey.asymmetricKeyType !== "ed25519")
    throw Error("Server-only Ed25519 private KeyObject required");
  if (!(input.expectedPinnedPublicKey instanceof Uint8Array) ||
      input.expectedPinnedPublicKey.length !== 32 ||
      !Number.isSafeInteger(input.trustedNowMs))
    throw Error("Pinned Ed25519 verifier and trusted server clock required");

  // Bind the signer to an independently configured pinned verifier. The
  // request/payload must NEVER choose its own trusted public verification key.
  const spki = createPublicKey(input.privateKey).export({
    format: "der", type: "spki",
  });
  const prefix = Buffer.from("302a300506032b6570032100", "hex");
  const expected = Buffer.from(input.expectedPinnedPublicKey);
  if (!Buffer.isBuffer(spki) || spki.length !== prefix.length + 32 ||
      !spki.subarray(0, prefix.length).equals(prefix) ||
      !timingSafeEqual(spki.subarray(prefix.length), expected))
    throw Error("Signer does not match the pinned Ed25519 verification key");

  // Reuse the EXACT existing Windows/Web verifier canonical encoding and
  // snapshot validation, including tenant-scoped rule identities/versions.
  const signedBytes = holidayDeviceReceipt.holidayDeviceSnapshotSigningBytes(input.payload);
  const newline = signedBytes.indexOf(10);
  if (newline < 0)
    throw Error("Missing canonical holiday receipt domain separator");
  const normalized = JSON.parse(new TextDecoder().decode(
    signedBytes.subarray(newline + 1),
  )) as holidayDeviceReceipt.HolidayDeviceSnapshot;
  if (normalized.issuedAt < input.trustedNowMs - 60_000 ||
      normalized.issuedAt > input.trustedNowMs + 60_000 ||
      normalized.expiresAt <= input.trustedNowMs)
    throw Error("Holiday receipt issuance must match trusted server time");
  const signatureBase64 = sign(null, Buffer.from(signedBytes), input.privateKey).toString("base64");
  return { payload: normalized, signatureBase64 };
}
