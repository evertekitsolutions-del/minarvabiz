import { can, getSessionToken, getSessionUser, getRemoteWriterGeneration } from '@minarvabiz/business-logic';
import { configFromEnv, pgRpc, pgSelectAll } from '@minarvabiz/database';
import { isRosterHydrated, resolveOnlineAuthorization } from './data-source';
import { createRosterPolicyClient } from './roster-policy-client';

/** A short-lived client pinned to the current authenticated hydration generation. */
export function onlineRosterPolicies() {
  const token=getSessionToken(), userId=getSessionUser()?.id, generation=getRemoteWriterGeneration();
  const config=configFromEnv();
  function ensureCurrent() {
    if (!token || !userId || !config || !isRosterHydrated() || !can('staff.manage') ||
        token!==getSessionToken() || userId!==getSessionUser()?.id || generation!==getRemoteWriterGeneration()) {
      throw Error('Roster policy session changed or unavailable; reload authorized data');
    }
  }
  ensureCurrent();
  const cfg={...config!,accessToken:token!};
  return createRosterPolicyClient({
    async authorize() {
      ensureCurrent();
      const auth=await resolveOnlineAuthorization(token!,userId!);
      ensureCurrent();
      if (!auth.ok) throw Error('Unable to authorize roster policy manager');
      return {orgId:auth.orgId,role:auth.role,ensureCurrent};
    },
    async read(authority) {
      authority.ensureCurrent();
      const result=await pgSelectAll<Record<string,unknown>>(cfg,'staff_roster_time_policies','select=*&order=effective_from.desc,id.asc');
      if (result.error) throw Error('Policy drafts unavailable: '+result.error.message);
      return result.data;
    },
    async write(args,authority) {
      authority.ensureCurrent();
      const result=await pgRpc<Record<string,unknown>>(cfg,'save_staff_roster_time_policy_draft',args);
      if (result.error) throw Error('Draft save was not confirmed. Reload before retrying: '+result.error.message);
      return result.data;
    },
  });
}
