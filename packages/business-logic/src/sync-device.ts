/**
 * PLT-005: fail-closed adapter for host-verified device possession.
 * The database fingerprint ALONE is not evidence that a device holds the
 * corresponding private key. Only a privileged host may supply actor/branch/
 * warehouse/company proofs and verify the signed one-time challenge.
 * This module does not create a sync session or write financial data.
 */
export interface FinancialSyncActorAuthority {
 readonly organizationId:string;
 readonly actorUserId:string;
 readonly companyId:string;
 readonly branchId:string;
 readonly warehouseId:string;
 readonly canPostFinancialSync:boolean;
 readonly companyGrantVerified:boolean;
 readonly warehouseGrantVerified:boolean;
}
export interface FinancialSyncEnrolledDevice {
 readonly organizationId:string;
 readonly deviceId:string;
 readonly publicKeySha256:string;
 readonly revokedAt:string|null;
}
export interface FinancialSyncDeviceBranchGrant {
 readonly organizationId:string;
 readonly deviceId:string;
 readonly branchId:string;
 readonly revokedAt:string|null;
}
export interface FinancialSyncSignedChallenge {
 readonly organizationId:string;
 readonly actorUserId:string;
 readonly companyId:string;
 readonly branchId:string;
 readonly warehouseId:string;
 readonly deviceId:string;
 readonly publicKeySha256:string;
 readonly operationId:string;
 readonly operationDigestSha256:string;
 readonly nonce:string;
 readonly issuedAt:string;
 readonly signature:string;
}
/** Host-side crypto verification MUST bind the nonce, digest, device and actor.
 * It must also atomically reject previously consumed nonces. */
export type VerifyFinancialSyncSignedChallenge = (
 signed:FinancialSyncSignedChallenge,
 actor:FinancialSyncActorAuthority,
 enrolled:FinancialSyncEnrolledDevice,
)=>true;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DIGEST=/^[0-9a-f]{64}$/;
const FIELDS=["organizationId","actorUserId","companyId","branchId","warehouseId"] as const;
/** Guard never treats JavaScript caller shape as proof of host authority. */
export function requireVerifiedFinancialSyncDevice(
 actor:FinancialSyncActorAuthority,
 enrolled:FinancialSyncEnrolledDevice,
 grant:FinancialSyncDeviceBranchGrant,
 signed:FinancialSyncSignedChallenge,
 verifySignature:VerifyFinancialSyncSignedChallenge,
 trustedNow:Date,
 enabled=false,
):true{
 if(enabled!==true)throw Error("Financial sync device authority feature disabled");
 if(!actor || !enrolled || !grant || !signed || typeof verifySignature!=="function"){
  throw Error("Trusted device, membership, branch and signature proof required");
 }
 if(actor.canPostFinancialSync!==true || actor.companyGrantVerified!==true ||
   actor.warehouseGrantVerified!==true)throw Error("Authoritative financial sync scope denied");
 for(const f of FIELDS){
  if(typeof actor[f]!=="string" || !UUID.test(actor[f]) || signed[f]!==actor[f]){
   throw Error("Financial sync actor scope mismatched");
  }
 }
 if(!UUID.test(enrolled.deviceId) || !UUID.test(signed.deviceId) ||
   !UUID.test(grant.deviceId) || !DIGEST.test(enrolled.publicKeySha256) ||
   signed.deviceId!==enrolled.deviceId || grant.deviceId!==enrolled.deviceId ||
   enrolled.organizationId!==actor.organizationId ||
   grant.organizationId!==actor.organizationId ||
   grant.branchId!==actor.branchId ||
   signed.publicKeySha256!==enrolled.publicKeySha256){
  throw Error("Financial sync device identity or branch grant mismatch");
 }
 if(enrolled.revokedAt!==null || grant.revokedAt!==null){
  throw Error("Revoked financial sync device or branch grant");
 }
 if(!UUID.test(signed.operationId) || !DIGEST.test(signed.operationDigestSha256) ||
   typeof signed.nonce!=="string" || signed.nonce.length<16 || signed.nonce.length>128 ||
   !/^[A-Za-z0-9_-]+$/.test(signed.nonce) ||
   typeof signed.signature!=="string" || signed.signature.length<24 ||
   signed.signature.length>8192){
  throw Error("Invalid signed financial sync challenge fields");
 }
 if(!(trustedNow instanceof Date) || !Number.isFinite(trustedNow.getTime()) ||
   typeof signed.issuedAt!=="string" ||
   !Number.isFinite(Date.parse(signed.issuedAt)) ||
   new Date(signed.issuedAt).toISOString()!==signed.issuedAt ||
   trustedNow.getTime()-Date.parse(signed.issuedAt)>5*60*1000 ||
   Date.parse(signed.issuedAt)>trustedNow.getTime()+30*1000){
  throw Error("Expired or future financial sync signature challenge");
 }
 if(verifySignature(signed,actor,enrolled)!==true){
  throw Error("Device cryptographic possession verification denied");
 }
 return true;
}
