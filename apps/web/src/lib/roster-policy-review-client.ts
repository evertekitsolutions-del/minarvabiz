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
export type ResolutionAction = 'revoked' | 'cancelled';
export interface PolicyResolution {
  id:string; org_id:string; branch_id:string; review_id:string;
  resolution:ResolutionAction; reason:string; resolved_by:string;
  resolved_at:string;
}
type Authority={orgId:string;role:string;ensureCurrent():void};
export interface ReviewTransport {
  authorize():Promise<Authority>;
  readDrafts(authority:Authority):Promise<unknown>;
  readReviews(authority:Authority):Promise<unknown>;
  writeReview(args:Record<string,unknown>,authority:Authority):Promise<unknown>;
  readResolutions(authority:Authority):Promise<unknown>;
  writeResolution(args:Record<string,unknown>,authority:Authority):Promise<unknown>;
  selectCandidate(args:Record<string,unknown>,authority:Authority):Promise<unknown>;
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
function parseResolution(raw:unknown,orgId:string):PolicyResolution {
  if(!object(raw))throw Error('Invalid policy resolution response');
  const r=raw as unknown as PolicyResolution;
  if(r.org_id!==orgId || !uuid(r.id) || !uuid(r.branch_id) ||
    !uuid(r.review_id) || !uuid(r.resolved_by) ||
    !['revoked','cancelled'].includes(r.resolution) ||
    typeof r.reason!=='string' || r.reason.trim()!==r.reason ||
    r.reason.length<5 || r.reason.length>1000 ||
    typeof r.resolved_at!=='string'||Number.isNaN(Date.parse(r.resolved_at)))
    throw Error('Invalid or foreign policy resolution');
  return r;
}
export function validateResolutionRequest(input:{review:PolicyReview;resolution:ResolutionAction;reason:string}){
  if(!object(input) || !['revoked','cancelled'].includes(input.resolution) ||
    typeof input.reason!=='string'||input.reason.trim().length<5||
    input.reason.trim().length>1000)throw Error('Resolution reason must be 5–1000 characters');
  if(input.review.decision!=='approved_pending_activation'||
     input.review.activation_state!=='inactive')throw Error('Only pending approved reviews can be resolved');
}
function validateCandidateDate(branchId:string,date:string){
  if(!uuid(branchId)||typeof date!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||
     date<'1900-01-01'||date>'9999-12-31'||
     new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)
    throw Error('Valid branch and policy date required');
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
    async list():Promise<{drafts:PolicyDraft[];reviews:PolicyReview[];resolutions:PolicyResolution[]}> {
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
      const rawResolutions=await transport.readResolutions(auth);auth.ensureCurrent();
      if(!Array.isArray(rawResolutions))throw Error('Invalid resolutions history response');
      const resolutions=rawResolutions.map(raw=>parseResolution(raw,auth.orgId));
      if(new Set(resolutions.map(r=>r.id)).size!==resolutions.length ||
        new Set(resolutions.map(r=>r.review_id)).size!==resolutions.length ||
        resolutions.some(r=>{
          const review=reviews.find(v=>v.id===r.review_id);
          return !review || review.branch_id!==r.branch_id ||
            review.decision!=='approved_pending_activation';
        }))throw Error('Resolution ledger identity mismatch');
      return {drafts,reviews,resolutions};
    },
    async resolve(input:{review:PolicyReview;resolution:ResolutionAction;reason:string}):
      Promise<{accepted:true;resolution:PolicyResolution}|{accepted:false;reason:string}> {
      validateResolutionRequest(input);
      const auth=await authorize();
      const review=parseReview(input.review,auth.orgId);
      const raw=await transport.writeResolution({
        p_review_id:review.id,p_expected_policy_version:review.policy_version,
        p_resolution:input.resolution,p_reason:input.reason.trim()
      },auth);
      auth.ensureCurrent();
      if(!object(raw)||typeof raw.accepted!=='boolean')
        throw Error('Policy resolution unconfirmed; reload before retrying');
      if(raw.accepted===false) {
        if(!['stale_review','superseded_review','already_resolved','not_pending_approval']
          .includes(String(raw.reason)))throw Error('Unknown policy resolution conflict');
        return {accepted:false,reason:String(raw.reason)};
      }
      if(raw.enforcement_active!==false)
        throw Error('Policy resolution may not activate scheduling');
      const resolution=parseResolution(raw.resolution,auth.orgId);
      if(resolution.review_id!==review.id||resolution.branch_id!==review.branch_id||
        resolution.resolution!==input.resolution||resolution.reason!==input.reason.trim())
        throw Error('Policy resolution confirmation differs from request');
      return {accepted:true,resolution};
    },
    async candidate(branchId:string,forDate:string):
      Promise<{accepted:true;review:PolicyReview}|{accepted:false;reason:'no_reviewed_candidate'}> {
      validateCandidateDate(branchId,forDate);
      const auth=await authorize();
      const raw=await transport.selectCandidate({
        p_branch_id:branchId,p_for_date:forDate
      },auth);
      auth.ensureCurrent();
      if(!object(raw)||typeof raw.accepted!=='boolean'||raw.enforcement_active!==false)
        throw Error('Unconfirmed or activating candidate response');
      if(raw.accepted===false){
        if(raw.reason!=='no_reviewed_candidate')
          throw Error('Unknown candidate selection result');
        return {accepted:false,reason:'no_reviewed_candidate'};
      }
      if(raw.selection_state!=='pending_activation_only')
        throw Error('Candidate must stay pending-only');
      const review=parseReview(raw.review,auth.orgId);
      if(review.branch_id!==branchId||review.decision!=='approved_pending_activation'||
        review.effective_from>forDate||
        (review.effective_until!==null&&review.effective_until<forDate))
        throw Error('Candidate date or branch confirmation mismatch');
      return {accepted:true,review};
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
