import { can, getSessionToken, getSessionUser, getRemoteWriterGeneration } from '@minarvabiz/business-logic';
import { configFromEnv, pgRpc, pgSelectAll } from '@minarvabiz/database';
import { isRosterHydrated, resolveOnlineAuthorization } from './data-source';
import { createRosterPolicyReviewClient } from './roster-policy-review-client';

export function onlineRosterPolicyReviews(){
  const token=getSessionToken(),userId=getSessionUser()?.id,generation=getRemoteWriterGeneration();
  const config=configFromEnv();
  function ensureCurrent(){
    if(!token||!userId||!config||!isRosterHydrated()||!can('staff.manage')||
      token!==getSessionToken()||userId!==getSessionUser()?.id||
      generation!==getRemoteWriterGeneration())
      throw Error('Roster review session changed or unavailable; reload authorized data');
  }
  ensureCurrent();
  const cfg={...config!,accessToken:token!};
  return createRosterPolicyReviewClient({
    async authorize(){
      ensureCurrent();
      const auth=await resolveOnlineAuthorization(token!,userId!);
      ensureCurrent();
      if(!auth.ok||!['super_admin','admin'].includes(auth.role))
        throw Error('Organization administrator permission required for policy reviews');
      return {orgId:auth.orgId,role:auth.role,ensureCurrent};
    },
    async readDrafts(authority){
      authority.ensureCurrent();
      const result=await pgSelectAll<Record<string,unknown>>(cfg,'staff_roster_time_policies','select=*&order=effective_from.desc,id.asc');
      authority.ensureCurrent();
      if(result.error)throw Error('Policy drafts unavailable: '+result.error.message);
      return result.data;
    },
    async readReviews(authority){
      authority.ensureCurrent();
      const result=await pgSelectAll<Record<string,unknown>>(cfg,'staff_roster_policy_reviews','select=*&order=reviewed_at.desc,id.asc');
      authority.ensureCurrent();
      if(result.error)throw Error('Policy review history unavailable: '+result.error.message);
      return result.data;
    },
    async writeReview(args,authority){
      authority.ensureCurrent();
      const result=await pgRpc<Record<string,unknown>>(cfg,'review_staff_roster_time_policy',args);
      authority.ensureCurrent();
      if(result.error)throw Error('Policy review unconfirmed. Reload before retrying: '+result.error.message);
      return result.data;
    }
  });
}
