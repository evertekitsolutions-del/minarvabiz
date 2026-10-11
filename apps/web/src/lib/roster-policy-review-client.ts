/**
 * HR-004C policy review boundary. Browser access remains constrained by
 * authenticated org membership, FORCE RLS, and the audited PostgreSQL RPC.
 * A review decision is never an activated scheduling policy.
 */
import { validatePolicyDraft, type PolicyDraft } from './roster-policy-client';

export type ReviewDecision = 'approved_pending_activation' | 'rejected';
export interface PolicyReview {
  id:string; org_id:string; branch_id:string; policy_id:string;
  policy_version:number; effective_from:string; effective_until:string|null;
  iana_zone:string; dst_fold_policy:'reject'|'earlier'|'later';
  minimum_rest_minutes:number; decision:ReviewDecision;
  activation_state:'inactive'; review_note:string|null;
  reviewed_by:string; reviewed_at:string; supersedes_review_id:string|null;
}
type Authority={orgId:string;role:string;ensureCurrent():void};
export interface ReviewTransport {
  authorize():Promise<Authority>;
  readDrafts(authority:Authority):Promise<unknown>;
  readReviews(authority:Authority):Promise<unknown>;
  writeReview(args:Record<string,unknown>,authority:Authority):Promise<unknown>;
}
const uuid=(x:unknown):x is string=>typeof x==='string'&&
  /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(x);
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);

function parseDraft(raw:unknown,orgId:string):PolicyDraft {
  if(!object(raw))throw Error('Invalid policy draft response');
  const r=raw as unknown as PolicyDraft;
  if(r.org_id!==orgId)throw Error('Roster policy organization mismatch');
  if(!uuid(r.id)||r.status!=='draft'||r.dst_gap_policy!=='reject'||
      !Number.isInteger(r.version)||r.version<1)throw Error('Invalid roster policy draft');
  validatePolicyDraft({branchId:r.branch_id,effectiveFrom:r.effective_from,
    effectiveUntil:r.effective_until,ianaZone:r.iana_zone,
    foldPolicy:r.dst_fold_policy,minimumRestMinutes:r.minimum_rest_minutes,
    expectedVersion:r.version});
  return r;
}
function parseReview(raw:unknown,orgId:string):PolicyReview {
  if(!object(raw))throw Error('Invalid policy review response');
  const r=raw as unknown as PolicyReview;
  if(r.org_id!==orgId)throw Error('Policy review organization mismatch');
  if(!uuid(r.id)||!uuid(r.branch_id)||!uuid(r.policy_id)||!uuid(r.reviewed_by)||
    (r.supersedes_review_id!==null&&!uuid(r.supersedes_review_id))||
    !Number.isInteger(r.policy_version)||r.policy_version<1||
    !['approved_pending_activation','rejected'].includes(r.decision)||
    r.activation_state!=='inactive'||typeof r.reviewed_at!=='string'||
    Number.isNaN(Date.parse(r.reviewed_at))||
    (r.review_note!==null&&(typeof r.review_note!=='string'||r.review_note.length>1000))||
    (r.decision==='rejected'&&!r.review_note?.trim()))
    throw Error('Invalid or active roster policy review');
  validatePolicyDraft({branchId:r.branch_id,effectiveFrom:r.effective_from,
    effectiveUntil:r.effective_until,ianaZone:r.iana_zone,
    foldPolicy:r.dst_fold_policy,minimumRestMinutes:r.minimum_rest_minutes,
    expectedVersion:r.policy_version});
  return r;
}
export function validateReviewRequest(input:{policy:PolicyDraft;decision:ReviewDecision;note:string}) {
  if(!object(input))throw Error('Invalid review request');
  if(!['approved_pending_activation','rejected'].includes(input.decision))
    throw Error('Invalid policy review decision');
  if(typeof input.note!=='string'||input.note.length>1000)
    throw Error('Review explanation must be 1000 characters or fewer');
  if(input.decision==='rejected'&&!input.note.trim())
    throw Error('A rejection reason is required');
}
export function createRosterPolicyReviewClient(transport:ReviewTransport){
  async function authorize(){
    const auth=await transport.authorize();
    if(!uuid(auth.orgId)||!['super_admin','admin'].includes(auth.role))
      throw Error('Organization administrator permission required');
    auth.ensureCurrent();return auth;
  }
  return {
    async list():Promise<{drafts:PolicyDraft[];reviews:PolicyReview[]}> {
      const auth=await authorize();
      const rawDrafts=await transport.readDrafts(auth);auth.ensureCurrent();
      if(!Array.isArray(rawDrafts))throw Error('Invalid policy drafts response');
      const drafts=rawDrafts.map(raw=>parseDraft(raw,auth.orgId));
      const rawReviews=await transport.readReviews(auth);auth.ensureCurrent();
      if(!Array.isArray(rawReviews))throw Error('Invalid policy reviews response');
      const reviews=rawReviews.map(raw=>parseReview(raw,auth.orgId));
      if(new Set(drafts.map(r=>r.id)).size!==drafts.length ||
         new Set(reviews.map(r=>r.id)).size!==reviews.length)
        throw Error('Duplicate policy review identity');
      if(reviews.some(r=>drafts.some(d=>d.id===r.policy_id&&d.branch_id!==r.branch_id)))
        throw Error('Policy review branch identity mismatch');
      return {drafts,reviews};
    },
    async review(input:{policy:PolicyDraft;decision:ReviewDecision;note:string}):
      Promise<{accepted:true;review:PolicyReview}|{accepted:false;reason:string;currentVersion?:number}> {
      validateReviewRequest(input);
      const auth=await authorize();
      const policy=parseDraft(input.policy,auth.orgId);
      const response=await transport.writeReview({
        p_policy_id:policy.id,p_expected_version:policy.version,
        p_decision:input.decision,p_review_note:input.note.trim()||null
      },auth);
      auth.ensureCurrent();
      if(!object(response)||typeof response.accepted!=='boolean')
        throw Error('Policy review response unconfirmed; reload before retrying');
      if(response.accepted===false){
        if(!['stale_draft','already_reviewed'].includes(String(response.reason)))
          throw Error('Unexpected policy review conflict; reload before retrying');
        const currentVersion=response.current_version;
        if(currentVersion!==undefined&&(!Number.isInteger(currentVersion)||Number(currentVersion)<1))
          throw Error('Invalid remote policy revision');
        return {accepted:false,reason:String(response.reason),
          ...(currentVersion===undefined?{}:{currentVersion:Number(currentVersion)})};
      }
      if(response.enforcement_active!==false)
        throw Error('Policy review must never enable scheduling enforcement');
      const review=parseReview(response.review,auth.orgId);
      if(review.policy_id!==policy.id||review.policy_version!==policy.version||
        review.branch_id!==policy.branch_id||
        review.effective_from!==policy.effective_from||
        review.effective_until!==policy.effective_until||
        review.iana_zone!==policy.iana_zone||
        review.dst_fold_policy!==policy.dst_fold_policy||
        review.minimum_rest_minutes!==policy.minimum_rest_minutes||
        review.decision!==input.decision||
        review.review_note!==(input.note.trim()||null))
        throw Error('Policy review confirmation does not match the selected draft');
      return {accepted:true,review};
    }
  };
}
