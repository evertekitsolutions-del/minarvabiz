import "server-only";
import { KeyObject, createPublicKey, sign, timingSafeEqual } from "node:crypto";

/**
 * B1 SERVER-ONLY signing kernel, NOT an enrollment API or authorization grant.
 *
 * Never call directly with a renderer/customer-supplied payload. Before call,
 * the future server route must authenticate the session, verify device PoP,
 * consume its challenge atomically, authorize actor/grants under tenant RLS,
 * durably audit issuance and source key/clock/identities from trusted state.
 * The issuer key MUST be distinct from commercial license/revocation keys.
 *
 * No HTTP handler, production secret loader, persistent key, or entitlement
 * activation is included in this draft.
 */
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const KEY_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const ROLES = new Set(["super_admin","admin","manager","cashier","tailor","staff"]);
const DOMAIN = "MINARVA-BIZ:B1:SYNC-DEVICE-AUTHORITY:v1:";
const SPKI = Buffer.from("302a300506032b6570032100","hex");
const MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SKEW_MS = 5 * 60 * 1000;
const MAX_BRANCHES = 128;

type DeviceRole = "super_admin" | "admin" | "manager" | "cashier" | "tailor" | "staff";
export interface DeviceAuthorityToSign {
  readonly type: "minarvabiz-sync-device-authority-v1";
  readonly version: 1;
  readonly keyId: string;
  readonly credentialId: string;
  readonly orgId: string;
  readonly deviceId: string;
  readonly actorUserId: string;
  readonly role: DeviceRole;
  readonly allowedBranchIds: ReadonlyArray<string>;
  readonly issuedAtMs: number;
  readonly notBeforeMs: number;
  readonly expiresAtMs: number;
}
export interface DeviceAuthorityServerSigningInput {
  readonly payload: DeviceAuthorityToSign;
  readonly privateKey: KeyObject;
  /** Expected, separately provisioned enrollment signing verifier, NOT from payload. */
  readonly pinnedPublicKeyHex: string;
  readonly expectedKeyId: string;
  readonly expectedOrgId: string;
  readonly expectedDeviceId: string;
  readonly expectedActorUserId: string;
  readonly expectedAllowedBranchIds: ReadonlyArray<string>;
  readonly trustedNowMs: number;
}
function isMs(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}
function uuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}
function canonicalIds(ids: unknown): ids is string[] {
  return Array.isArray(ids) && ids.length > 0 && ids.length <= MAX_BRANCHES &&
    ids.every((id: unknown, i: number) =>
      uuid(id) && (i === 0 || (typeof ids[i-1] === "string" && ids[i-1] < id)));
}
function matchingBranches(left: ReadonlyArray<string>,right: ReadonlyArray<string>): boolean {
  return left.length === right.length && left.every((v,i)=>v === right[i]);
}

/** Produces the exact domain-separated token accepted by the native verifier. */
export function signDeviceAuthorityDraftServerOnly(input: DeviceAuthorityServerSigningInput): string {
  if (!input || !input.payload || typeof input.payload !== "object" ||
      !(input.privateKey instanceof KeyObject) ||
      input.privateKey.type !== "private" ||
      input.privateKey.asymmetricKeyType !== "ed25519" ||
      !isMs(input.trustedNowMs))
    throw Error("Invalid trusted server issuance key/clock");
  const p = input.payload;
  const keys = ["type","version","keyId","credentialId","orgId","deviceId",
    "actorUserId","role","allowedBranchIds","issuedAtMs","notBeforeMs","expiresAtMs"];
  if (Object.keys(p).length !== keys.length ||
      keys.some(k => !Object.prototype.hasOwnProperty.call(p,k)) ||
      p.type !== "minarvabiz-sync-device-authority-v1" || p.version !== 1 ||
      !KEY_ID.test(p.keyId) ||
      !uuid(p.credentialId) || !uuid(p.orgId) || !uuid(p.deviceId) ||
      !uuid(p.actorUserId) || !ROLES.has(p.role) ||
      !canonicalIds(p.allowedBranchIds) ||
      !isMs(p.issuedAtMs) || !isMs(p.notBeforeMs) || !isMs(p.expiresAtMs) ||
      p.notBeforeMs < p.issuedAtMs ||
      p.expiresAtMs <= p.notBeforeMs ||
      p.expiresAtMs - p.issuedAtMs > MAX_TTL_MS ||
      p.issuedAtMs < input.trustedNowMs - MAX_SKEW_MS ||
      p.issuedAtMs > input.trustedNowMs + MAX_SKEW_MS ||
      p.notBeforeMs > input.trustedNowMs + MAX_SKEW_MS ||
      input.trustedNowMs >= p.expiresAtMs)
    throw Error("Invalid signed authority fields or lifetime");

  if (!uuid(input.expectedOrgId) || !uuid(input.expectedDeviceId) ||
      !uuid(input.expectedActorUserId) ||
      !KEY_ID.test(input.expectedKeyId) ||
      !canonicalIds(input.expectedAllowedBranchIds) ||
      p.keyId !== input.expectedKeyId ||
      p.orgId !== input.expectedOrgId ||
      p.deviceId !== input.expectedDeviceId ||
      p.actorUserId !== input.expectedActorUserId ||
      !matchingBranches(p.allowedBranchIds,input.expectedAllowedBranchIds))
    throw Error("Signed authority trusted tenant/device/actor/branch scope mismatch");

  if (typeof input.pinnedPublicKeyHex !== "string" ||
      !/^[0-9a-f]{64}$/i.test(input.pinnedPublicKeyHex))
    throw Error("Invalid trusted pinned enrollment signing verifier");
  const publicDer = createPublicKey(input.privateKey).export({format:"der",type:"spki"});
  const expected = Buffer.from(input.pinnedPublicKeyHex,"hex");
  if (!Buffer.isBuffer(publicDer) || publicDer.length !== SPKI.length+32 ||
      !publicDer.subarray(0,SPKI.length).equals(SPKI) ||
      !timingSafeEqual(publicDer.subarray(SPKI.length),expected))
    throw Error("Signing private key does not match trusted pinned enrollment verifier");

  // One unambiguous canonical serialization; renderer cannot supply field order.
  const normalized = {
    type:p.type,version:p.version,keyId:p.keyId,credentialId:p.credentialId,
    orgId:p.orgId,deviceId:p.deviceId,actorUserId:p.actorUserId,role:p.role,
    allowedBranchIds:[...p.allowedBranchIds],
    issuedAtMs:p.issuedAtMs,notBeforeMs:p.notBeforeMs,expiresAtMs:p.expiresAtMs,
  };
  const body = Buffer.from(JSON.stringify(normalized),"utf8").toString("base64url");
  const signature = sign(null,Buffer.from(DOMAIN+body,"utf8"),input.privateKey)
    .toString("base64url");
  const token = body+"."+signature;
  if (token.length > 8192) throw Error("Invalid authority token length");
  return token;
}
