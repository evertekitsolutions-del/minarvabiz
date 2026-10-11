import assert from 'node:assert/strict';
import { createRosterPolicyReviewClient } from '../../../../apps/web/src/lib/roster-policy-review-client.ts';

const org='10000000-0000-4000-8000-000000000001';
const branch='c1000000-0000-4000-8000-000000000001';
const draft={id:'30000000-0000-4000-8000-000000000001',org_id:org,branch_id:branch,effective_from:'2026-11-01',effective_until:null,iana_zone:'America/New_York',dst_gap_policy:'reject',dst_fold_policy:'later',minimum_rest_minutes:720,status:'draft',version:2};
const review={id:'40000000-0000-4000-8000-000000000001',org_id:org,branch_id:branch,policy_id:draft.id,policy_version:2,effective_from:draft.effective_from,effective_until:null,iana_zone:draft.iana_zone,dst_fold_policy:draft.dst_fold_policy,minimum_rest_minutes:720,decision:'approved_pending_activation',activation_state:'inactive',review_note:'Reviewed',reviewed_by:'50000000-0000-4000-8000-000000000001',reviewed_at:'2026-10-11T05:00:00Z',supersedes_review_id:null};
let role='admin',current=true,writes=0,raw={accepted:true,review,enforcement_active:false},drafts=[draft],history=[review];
const client=createRosterPolicyReviewClient({
  authorize:async()=>({orgId:org,role,ensureCurrent(){if(!current)throw Error('Session changed');}}),
  readDrafts:async()=>drafts,
  readReviews:async()=>history,
  writeReview:async args=>{writes++;assert.equal(args.p_expected_version,2);return raw;}
});
const input={policy:draft,decision:'approved_pending_activation',note:'Reviewed'};
assert.equal((await client.list()).drafts.length,1);
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
