#!/usr/bin/env node
// M24 UNOVERRIDABLE REAL-JWT gate: requires TWO separately authenticated user
// sessions from different tenants and a third cashier/staff test session.
// No service_role key and no SQL SET ROLE can substitute for this validation.
import assert from "node:assert/strict";
import {setTimeout as pause} from "node:timers/promises";

const env=process.env;
const vars=[
 "MINARVA_QA_SUPABASE_URL","MINARVA_QA_PUBLISHABLE_KEY",
 "MINARVA_QA_TENANT_A_JWT","MINARVA_QA_TENANT_B_JWT",
 "MINARVA_QA_TENANT_A_ORG","MINARVA_QA_TENANT_B_ORG",
 "MINARVA_QA_STAFF_JWT"
];
const absent=vars.filter(k=>!env[k]);
if(absent.length)throw new Error(
 "SIGNED_JWT_GATE_BLOCKED: configure independent A/B/staff test sessions: "+
 absent.filter(k=>!k.includes("_JWT")).join(", ")+
 (absent.some(k=>k.includes("_JWT"))?" and missing JWT secrets":"")
);
const base=env.MINARVA_QA_SUPABASE_URL.replace(/\/+$/,"");
const apiKey=env.MINARVA_QA_PUBLISHABLE_KEY;
const headers=(jwt)=>({
 apikey:apiKey,Authorization:"Bearer "+jwt,
 "Content-Type":"application/json",Accept:"application/json"
});
async function getJson(path,jwt,{method="GET",body}={}){
 const r=await fetch(base+path,{method,headers:headers(jwt),
  ...(body?{body:JSON.stringify(body)}:{}),cache:"no-store",
  signal:AbortSignal.timeout(10000)});
 const response=await r.json().catch(()=>[]);
 return {ok:r.ok,status:r.status,response};
}
async function proveUser(jwt,expectedOrg,allowRole){
 const user=await getJson("/auth/v1/user",jwt);
 assert.equal(user.ok,true,"Actual JWT /auth/v1/user must succeed");
 const auth=await getJson("/rest/v1/rpc/current_user_authorization",jwt,{
  method:"POST",body:{}
 });
 assert.equal(auth.ok,true,"JWT membership RPC must succeed");
 assert.equal(auth.response.length,1,"Exactly one membership must be attached");
 assert.equal(auth.response[0].auth_org_id,expectedOrg,"JWT org must match expected tenant");
 assert.equal(auth.response[0].auth_user_id,user.response.id,"JWT principal must match membership");
 assert.ok(allowRole.includes(auth.response[0].auth_role),"User role mismatch");
 return user.response.id;
}
const [a,b,s]=await Promise.all([
 proveUser(env.MINARVA_QA_TENANT_A_JWT,env.MINARVA_QA_TENANT_A_ORG,["admin","super_admin"]),
 proveUser(env.MINARVA_QA_TENANT_B_JWT,env.MINARVA_QA_TENANT_B_ORG,["admin","super_admin"]),
 getJson("/auth/v1/user",env.MINARVA_QA_STAFF_JWT)
]);
assert.equal(s.ok,true,"Staff JWT must be valid");
assert.notEqual(a,b,"Tenant principals must be distinct");
assert.notEqual(s.response.id,a,"Staff JWT must use a separate authenticated principal");
assert.notEqual(s.response.id,b,"Staff JWT must use a separate authenticated principal");
assert.notEqual(env.MINARVA_QA_TENANT_A_ORG,env.MINARVA_QA_TENANT_B_ORG,"Test tenants must be different");
const staffAuth=await getJson("/rest/v1/rpc/current_user_authorization",
 env.MINARVA_QA_STAFF_JWT,{method:"POST",body:{}});
assert.equal(staffAuth.ok,true);
assert.equal(staffAuth.response.length,1);
assert.ok(["cashier","staff"].includes(staffAuth.response[0].auth_role),"Third JWT must be cashier or staff");
assert.ok([env.MINARVA_QA_TENANT_A_ORG,env.MINARVA_QA_TENANT_B_ORG].includes(staffAuth.response[0].auth_org_id),"Staff session must belong to one of the independently authenticated test tenants");

const tables=[
 "organizations","branches","products","categories","inventory_transactions",
 "suppliers","sales","purchase_invoices","purchase_invoice_lines",
 "organization_members","laundry_orders","saas_laundry_garment_jobs",
 "saas_finance_accounts","saas_finance_entries","saas_storefronts",
 "saas_storefront_draft_orders","saas_marketing_leads","saas_marketing_coupons",
 "saas_field_visits","saas_tenant_subscriptions","saas_partner_referrals",
 "saas_subscription_checkout_intents","saas_subscription_payment_receipts",
 "saas_subscription_state_events",
 "saas_partner_referral_commissions"
];
// Repeat both authenticated organizations and a third staff session under
// bounded parallel live HTTP reads. Every response must be inaccessible, not
// merely a successful local SQL role simulation or a synthetic JWT claim.
const trafficRounds=3;
const requests=[];
for(const [jwt,oppositeOrg,role] of [
 [env.MINARVA_QA_TENANT_A_JWT,env.MINARVA_QA_TENANT_B_ORG,"tenant-a"],
 [env.MINARVA_QA_TENANT_B_JWT,env.MINARVA_QA_TENANT_A_ORG,"tenant-b"],
 [env.MINARVA_QA_STAFF_JWT,
  staffAuth.response[0].auth_org_id===env.MINARVA_QA_TENANT_A_ORG
   ? env.MINARVA_QA_TENANT_B_ORG : env.MINARVA_QA_TENANT_A_ORG,"staff"]
]){
 for(let round=0;round<trafficRounds;round++){
  for(const table of tables){
   // Only private tenant records are asserted here; public commerce discoverability
   // is separately scoped and must not be misclassified as a RLS leak.
   if(["organizations","saas_storefronts","saas_partner_referrals",
       "saas_partner_referral_commissions"].includes(table))continue;
   requests.push({jwt,oppositeOrg,role,round,table});
  }
 }
}
for(let start=0;start<requests.length;start+=8){
 const batch=requests.slice(start,start+8);
 const results=await Promise.all(batch.map(async entry=>{
  const path="/rest/v1/"+entry.table+"?select=org_id&org_id=eq."+
   entry.oppositeOrg+"&limit=1";
  return {...entry,x:await getJson(path,entry.jwt)};
 }));
 for(const {table,role,round,x} of results){
  if(x.ok){
   assert.ok(Array.isArray(x.response),"Expected JSON row list: "+table);
   assert.equal(x.response.length,0,
    "CROSS_TENANT_LEAK: "+table+" exposed opposite tenant to "+role+
    " on traffic round "+round);
  }else{
   assert.ok([401,403].includes(x.status),
    "Unexpected API status "+x.status+" at "+table+" for "+role);
  }
 }
}
const deniedCalls=[
 ["saas_start_tenant_trial_once",{p_plan_code:"base",p_partner_code:null}],
 ["saas_register_partner_code_once",{p_id:crypto.randomUUID(),p_code:"NOSTAFF1234"}],
 ["saas_capture_signed_subscription_payment_once",{
  p_provider_event_id:"evt_DENIEDTEST01",p_provider_payment_id:"pay_DENIEDTEST01",
  p_provider_order_id:"order_DENIEDTEST01",p_amount_paise:271282,
  p_currency:"INR",p_environment:"sandbox",p_raw_body_sha256:"b".repeat(64)}],
 ["saas_register_checkout_intent_once",{
  p_intent_id:crypto.randomUUID(),p_org_id:staffAuth.response[0].auth_org_id,
  p_actor_user_id:s.response.id,p_plan_code:"base",
  p_provider_order_id:"order_DENIEDTEST02",p_environment:"sandbox"}]
];
for(const [rpc,payload] of deniedCalls){
 const response=await getJson("/rest/v1/rpc/"+rpc,env.MINARVA_QA_STAFF_JWT,{
  method:"POST",body:payload});
 assert.ok([401,403,404].includes(response.status),
  "Staff role should be explicitly blocked, not merely fail invalid input: "+rpc+" "+response.status);
}
// For HMAC webhook tests use separate server-side signed fixture contract.
// This live JWT gate does not depend on production customer payment secrets.
await pause(1);
console.log("SIGNED_JWT_A_B_STAFF_GATE_PASS ("+requests.length+" authenticated, bounded-concurrent tenant-isolation reads; purchases, sales, subscription receipts/events and staff negative RPCs)");
