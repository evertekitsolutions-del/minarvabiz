/**
 * B1 enrollment proof-of-possession (protocol only; no enrollment activation).
 * Native signer must be held exclusively inside the trusted main process.
 * Server verifier MUST receive its expected scope, nonce and public key
 * from authenticated, pending, single-use enrollment state, never the proof.
 */
import {
  createPublicKey, sign, verify, type KeyObject,
} from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NONCE = /^[A-Za-z0-9_-]{43}$/;
const KEY = /^[A-Za-z0-9_-]{43}$/;
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/;
const DOMAIN = "MINARVA-BIZ:B1:ENROLLMENT-PROOF:v1:";
const MAX_CHALLENGE_AGE_MS = 5 * 60 * 1000;
const ED25519_SPKI = Buffer.from("302a300506032b6570032100", "hex");
const CHALLENGE_KEYS = [
  "type", "version", "challengeId", "orgId", "deviceId",
  "actorUserId", "branchId", "nonce", "issuedAtMs", "expiresAtMs",
] as const;
const PROOF_KEYS = ["challenge", "publicKeyBase64Url", "signatureBase64Url"] as const;

interface EnrollmentChallenge {
  readonly type: "minarvabiz-sync-enrollment-challenge-v1";
  readonly version: 1;
  readonly challengeId: string;
  readonly orgId: string;
  readonly deviceId: string;
  readonly actorUserId: string;
  readonly branchId: string;
  readonly nonce: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
}
interface EnrollmentProof {
  readonly challenge: EnrollmentChallenge;
  readonly publicKeyBase64Url: string;
  readonly signatureBase64Url: string;
}

interface ExpectedScope {
  readonly expectedOrgId: string;
  readonly expectedDeviceId: string;
  readonly expectedActorUserId: string;
  readonly expectedBranchId: string;
  readonly nowMs: number;
}
export interface NativeEnrollmentProofSigner extends ExpectedScope {
  /** Must be the public key registered in a trusted enrollment store. */
  readonly expectedPublicKeyBase64Url: string;
  readonly privateKey: KeyObject;
}
export interface ServerEnrollmentProofTrust extends ExpectedScope {
  readonly expectedChallengeId: string;
  readonly expectedNonce: string;
  readonly registeredPublicKeyBase64Url: string;
  /** Must consume a DB-backed challenge exactly once atomically across workers. */
  readonly consumeChallenge: (challengeId: string) => Promise<boolean>;
}
export type NativeProofSignResult =
  | { ok: true; proof: EnrollmentProof }
  | { ok: false; code: "invalid_challenge" | "scope_mismatch" | "invalid_key" | "expired" };

export type ProofVerifyResult =
  | { ok: true; deviceId: string; challengeId: string }
  | { ok: false; code: "malformed" | "scope_mismatch" | "invalid_signature" | "expired" | "replayed" };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length &&
    keys.every(k => Object.prototype.hasOwnProperty.call(value, k));
}
function fixedB64(text: unknown, pattern: RegExp, byteCount: number): text is string {
  if (typeof text !== "string" || !pattern.test(text)) return false;
  const decoded = Buffer.from(text, "base64url");
  return decoded.length === byteCount && decoded.toString("base64url") === text;
}
function isMillisecond(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function parseChallenge(input: unknown): EnrollmentChallenge | null {
  if (!record(input) || !exactKeys(input, CHALLENGE_KEYS)) return null;
  if (input.type !== "minarvabiz-sync-enrollment-challenge-v1" ||
      input.version !== 1 ||
      ![input.challengeId,input.orgId,input.deviceId,input.actorUserId,input.branchId]
        .every(x => typeof x === "string" && UUID.test(x)) ||
      !fixedB64(input.nonce, NONCE, 32) ||
      !isMillisecond(input.issuedAtMs) || !isMillisecond(input.expiresAtMs) ||
      input.expiresAtMs <= input.issuedAtMs ||
      input.expiresAtMs - input.issuedAtMs > MAX_CHALLENGE_AGE_MS)
    return null;
  return input as unknown as EnrollmentChallenge;
}
function canonicalChallenge(ch: EnrollmentChallenge): string {
  return JSON.stringify({
    type:ch.type,version:ch.version,challengeId:ch.challengeId,
    orgId:ch.orgId,deviceId:ch.deviceId,actorUserId:ch.actorUserId,
    branchId:ch.branchId,nonce:ch.nonce,
    issuedAtMs:ch.issuedAtMs,expiresAtMs:ch.expiresAtMs,
  });
}
function scopeMatches(ch: EnrollmentChallenge, ctx: ExpectedScope): boolean {
  return ch.orgId === ctx.expectedOrgId &&
    ch.deviceId === ctx.expectedDeviceId &&
    ch.actorUserId === ctx.expectedActorUserId &&
    ch.branchId === ctx.expectedBranchId &&
    [ctx.expectedOrgId,ctx.expectedDeviceId,ctx.expectedActorUserId,ctx.expectedBranchId]
      .every(x => typeof x === "string" && UUID.test(x));
}
function active(ch: EnrollmentChallenge, nowMs: number): boolean {
  return isMillisecond(nowMs) && nowMs >= ch.issuedAtMs && nowMs < ch.expiresAtMs;
}
function signingBytes(ch: EnrollmentChallenge): Buffer {
  return Buffer.from(DOMAIN + canonicalChallenge(ch), "utf8");
}
function nativePubKey(privateKey: KeyObject): string | null {
  try {
    if (privateKey.type !== "private" || privateKey.asymmetricKeyType !== "ed25519") return null;
    const der = createPublicKey(privateKey).export({ type:"spki",format:"der" });
    if (!Buffer.isBuffer(der) || der.length !== ED25519_SPKI.length + 32 ||
        !der.subarray(0,ED25519_SPKI.length).equals(ED25519_SPKI)) return null;
    return der.subarray(-32).toString("base64url");
  } catch {
    return null;
  }
}

/** Requires a native-held private key. No key material is returned. */
export function signNativeEnrollmentChallenge(
  input: unknown,
  ctx: NativeEnrollmentProofSigner,
): NativeProofSignResult {
  const ch = parseChallenge(input);
  if (!ch) return {ok:false,code:"invalid_challenge"};
  if (!scopeMatches(ch,ctx)) return {ok:false,code:"scope_mismatch"};
  if (!active(ch,ctx.nowMs)) return {ok:false,code:"expired"};
  const pub = nativePubKey(ctx.privateKey);
  if (!pub || !fixedB64(ctx.expectedPublicKeyBase64Url,KEY,32) ||
      pub !== ctx.expectedPublicKeyBase64Url) return {ok:false,code:"invalid_key"};
  try {
    return {ok:true,proof:Object.freeze({
      challenge:Object.freeze({...ch}),
      publicKeyBase64Url:pub,
      signatureBase64Url:sign(null,signingBytes(ch),ctx.privateKey).toString("base64url"),
    })};
  } catch { return {ok:false,code:"invalid_key"}; }
}

/** Cryptographic PoP does not approve or enroll the device by itself. */
export async function verifyNativeEnrollmentProof(
  input: unknown,
  ctx: ServerEnrollmentProofTrust,
): Promise<ProofVerifyResult> {
  if (!record(input) || !exactKeys(input,PROOF_KEYS)) return {ok:false,code:"malformed"};
  const ch = parseChallenge(input.challenge);
  if (!ch || !fixedB64(input.publicKeyBase64Url,KEY,32) ||
      !fixedB64(input.signatureBase64Url,SIGNATURE,64)) return {ok:false,code:"malformed"};
  if (!scopeMatches(ch,ctx) || ch.challengeId !== ctx.expectedChallengeId ||
      ch.nonce !== ctx.expectedNonce) return {ok:false,code:"scope_mismatch"};
  if (!active(ch,ctx.nowMs)) return {ok:false,code:"expired"};
  if (input.publicKeyBase64Url !== ctx.registeredPublicKeyBase64Url ||
      !fixedB64(ctx.registeredPublicKeyBase64Url,KEY,32)) return {ok:false,code:"invalid_signature"};
  try {
    const key = createPublicKey({
      key:Buffer.concat([ED25519_SPKI,Buffer.from(ctx.registeredPublicKeyBase64Url,"base64url")]),
      format:"der",type:"spki",
    });
    if (!verify(null,signingBytes(ch),key,
      Buffer.from(input.signatureBase64Url,"base64url"))) return {ok:false,code:"invalid_signature"};
  } catch { return {ok:false,code:"invalid_signature"}; }
  try {
    if (await ctx.consumeChallenge(ch.challengeId) !== true) return {ok:false,code:"replayed"};
  } catch { return {ok:false,code:"replayed"}; }
  return {ok:true,deviceId:ch.deviceId,challengeId:ch.challengeId};
}
