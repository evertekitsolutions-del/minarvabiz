import "server-only";

function config(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/,"");
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!/^https:\/\//.test(url)||!secret)
  throw new Error("Supabase server-side billing credentials missing");
 return {url,secret};
}
type RestFailure={message?:string;code?:string;details?:string};
export async function billingAdminRequest<T>(
 resource:string,body:Record<string,unknown>,method:"POST"|"GET"="POST"
):Promise<T>{
 const {url,secret}=config();
 const response=await fetch(url+"/rest/v1/"+resource,{
  method,headers:{
   apikey:secret,Authorization:"Bearer "+secret,
   "Content-Type":"application/json",
   Accept:"application/json",
   Prefer:"return=representation",
  },
  ...(method==="POST"?{body:JSON.stringify(body)}:{}),
  cache:"no-store",signal:AbortSignal.timeout(9000)
 });
 if(!response.ok){
  const err=await response.json().catch(()=>({} as RestFailure)) as RestFailure;
  throw new Error("Billing persistence rejected ("+response.status+"): "+(err.code||"not_committed"));
 }
 return await response.json() as T;
}
export async function verifiedBillingActor(token:string){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/,"");
 const apiKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!apiKey||!token||token.length>8192)
  throw new Error("Signed-in tenant session required");
 const response=await fetch(url+"/auth/v1/user",{
  headers:{apikey:apiKey,Authorization:"Bearer "+token},
  cache:"no-store",signal:AbortSignal.timeout(7500)
 });
 if(!response.ok)throw new Error("JWT user verification failed");
 const user=await response.json() as {id?:string};
 if(!user.id||!/^[0-9a-f-]{36}$/i.test(user.id))
  throw new Error("JWT user identity missing");
 const members=await billingAdminRequest<{org_id:string;role:string}[]>(
  "organization_members?select=org_id,role&user_id=eq."+user.id,
  {},"GET");
 if(members.length!==1||!["super_admin","admin"].includes(members[0].role))
  throw new Error("Tenant administrator permission required");
 return {userId:user.id,orgId:members[0].org_id};
}
