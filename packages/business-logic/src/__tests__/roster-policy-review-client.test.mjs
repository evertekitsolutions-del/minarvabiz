import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const draftModule={exports:{}};
vm.runInNewContext(compile('apps/web/src/lib/roster-policy-client.ts'),{exports:draftModule.exports});
const reviewModule={exports:{}};
vm.runInNewContext(compile('apps/web/src/lib/roster-policy-review-client.ts'),{
  exports:reviewModule.exports,require:name=>{assert.equal(name,'./roster-policy-client');return draftModule.exports;}
});
const { createRosterPolicyReviewClient }=reviewModule.exports;

const org='10000000-0000-4000-8000-000000000001';
const branch='c1000000-0000-4000-8000-000000000001';
const draft={id:'30000000-0000-4000-8000-000000000001',org_id:org,branch_id:branch,effective_from:'2026-11-01',effective_until:null,iana_zone:'America/New_York',dst_gap_policy:'reject',dst_fold_policy:'later',minimum_rest_minutes:720,status:'draft',version:2};
const review={id:'40000000-0000-4000-8000-000000000001',org_id:org,branch_id:branch,policy_id:draft.id,policy_version:2,effective_from:draft.effective_from,effective_until:null,iana_zone:draft.iana_zone,dst_fold_policy:draft.dst_fold_policy,minimum_rest_minutes:720,decision:'approved_pending_activation',activation_state:'inactive',review_note:'Reviewed',reviewed_by:'50000000-0000-4000-8000-000000000001',reviewed_at:'2026-10-11T05:00:00Z',supersedes_review_id:null};
let role='admin',current=true,writes=0,raw={accepted:true,review,enforcement_active:false},drafts=[draft],history=[review];
const resolution={id:'60000000-0000-4000-8000-000000000001',org_id:org,branch_id:branch,
  review_id:review.id,resolution:'revoked',reason:'Approval withdrawn',resolved_by:review.reviewed_by,
  resolved_at:'2026-10-11T06:00:00Z'};
let termination={accepted:true,resolution,enforcement_active:false};
let selected={accepted:true,review,selection_state:'pending_activation_only',enforcement_active:false};
const client=createRosterPolicyReviewClient({
  authorize:async()=>({orgId:org,role,ensureCurrent(){if(!current)throw Error('Session changed');}}),
  readDrafts:async()=>drafts,
  readReviews:async()=>history,
  readResolutions:async()=>[],
  writeResolution:async args=>{assert.equal(args.p_expected_policy_version,2);return termination;},
  selectCandidate:async args=>{assert.equal(args.p_branch_id,branch);return selected;},
  writeReview:async args=>{writes++;assert.equal(args.p_expected_version,2);return raw;}
});
const input={policy:draft,decision:'approved_pending_activation',note:'Reviewed'};
assert.equal((await client.list()).drafts.length,1);
const resolved=await client.resolve({review,resolution:'revoked',reason:'Approval withdrawn'});
assert.equal(resolved.accepted,true);
assert.equal(resolved.resolution.review_id,review.id);
assert.equal((await client.candidate(branch,'2026-11-10')).accepted,true);
selected={accepted:true,review:{...review,branch_id:'c2000000-0000-4000-8000-000000000002'},selection_state:'pending_activation_only',enforcement_active:false};
await assert.rejects(client.candidate(branch,'2026-11-10'),/branch/);
selected={accepted:false,reason:'no_reviewed_candidate',enforcement_active:false};
assert.equal((await client.candidate(branch,'2026-11-10')).accepted,false);
selected={accepted:true,review,selection_state:'active',enforcement_active:true};
await assert.rejects(client.candidate(branch,'2026-11-10'),/activating/);
termination={accepted:true,resolution:{...resolution,review_id:'60000000-0000-4000-8000-000000000002'},enforcement_active:false};
await assert.rejects(client.resolve({review,resolution:'revoked',reason:'Approval withdrawn'}),/confirmation/);
termination={accepted:false,reason:'already_resolved'};
assert.equal((await client.resolve({review,resolution:'revoked',reason:'Approval withdrawn'})).accepted,false);
await assert.rejects(client.resolve({review,resolution:'revoked',reason:'  '}),/reason/);
termination={accepted:true,resolution,enforcement_active:false};
assert.equal((await client.review(input)).accepted,true);
for(const mutation of [{activation_state:'active'},{policy_version:1},{minimum_rest_minutes:30},{org_id:'20000000-0000-4000-8000-000000000002'}]){
 raw={accepted:true,review:{...review,...mutation},enforcement_active:false};
 await assert.rejects(client.review(input));
}
raw={accepted:true,review,enforcement_active:true};
await assert.rejects(client.review(input),/enforcement/);
raw={accepted:false,reason:'stale_draft',current_version:3};
assert.equal((await client.review(input)).accepted,false);
raw={accepted:true,review,enforcement_active:false};
const before=writes;
await assert.rejects(client.review({...input,decision:'rejected',note:'  '}),/reason/);
assert.equal(writes,before);
role='manager';await assert.rejects(client.list(),/administrator/);
await assert.rejects(client.review(input),/administrator/);
role='admin';history=[{...review,org_id:'20000000-0000-4000-8000-000000000002'}];
await assert.rejects(client.list(),/organization/);
history=[review];current=false;await assert.rejects(client.review(input),/Session changed/);
console.log('Roster review client security/tenant/revision/activation tests PASS');
