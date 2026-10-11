import {can,getSessionToken,getSessionUser,getRemoteWriterGeneration} from "@minarvabiz/business-logic";
import {configFromEnv,pgSelectAll,pgRpc} from "@minarvabiz/database";
import {isRosterHydrated,resolveOnlineAuthorization} from "./data-source";
import {createHolidayManagerClient} from "./holiday-client";

/** Disabled until explicitly deployed + audited HR005 schema verified. */
export const holidayManagementEnabled=process.env.NEXT_PUBLIC_HR005_HOLIDAYS_READY==="true";

export function onlineHolidayManager(): ReturnType<typeof createHolidayManagerClient>{
 if(!holidayManagementEnabled)throw Error("Holiday database rollout is not enabled; no write was attempted");
 const token=getSessionToken(),userId=getSessionUser()?.id,generation=getRemoteWriterGeneration();
 const config=configFromEnv();
 function ensureCurrent(){
   if(!token||!userId||!config||!isRosterHydrated()||!can("staff.manage")||
      token!==getSessionToken()||userId!==getSessionUser()?.id||
      generation!==getRemoteWriterGeneration())
      throw Error("Holiday manager session changed or unauthorized; reload");
 }
 ensureCurrent();
 const cfg={...config!,accessToken:token!};
 return createHolidayManagerClient({
   async authorize(){
     ensureCurrent();
     const a=await resolveOnlineAuthorization(token!,userId!);
     ensureCurrent();
     if(!a.ok||!["super_admin","admin","manager"].includes(a.role))
       throw Error("Authorized organization holiday manager required");
     return {orgId:a.orgId,role:a.role,ensureCurrent};
   },
   async read(a){
     a.ensureCurrent();
     const r=await pgSelectAll<Record<string,unknown>>(cfg,"staff_holiday_rules","select=*&order=holiday_on.asc,id.asc");
     a.ensureCurrent();
     if(r.error)throw Error("Authorized holiday calendar unavailable: "+r.error.message);
     return r.data;
   },
   async write(args,a){
     a.ensureCurrent();
     const r=await pgRpc<Record<string,unknown>>(cfg,"save_staff_holiday_rule",args);
     a.ensureCurrent();
     if(r.error)throw Error("Holiday save unconfirmed; reload before retrying: "+r.error.message);
     return r.data;
   }
 });
}
