import {NextRequest,NextResponse} from "next/server";
import {billingAdminRequest,verifiedBillingActor,billingServerReady} from "@/lib/billing-admin-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Subscription={org_id:string;plan_code:string;state:string};
type Plan={code:string;annual_inr:number};
export async function POST(req:NextRequest){
 const key=process.env.RAZORPAY_KEY_ID,secret=process.env.RAZORPAY_KEY_SECRET;
 const environment=process.env.RAZORPAY_ENVIRONMENT==="live"?"live":"sandbox";
 if(!key||!secret||(environment==="live"&&process.env.MINARVA_LIVE_BILLING_ENABLED!=="true")||
  (environment==="sandbox"&&!key.startsWith("rzp_test_"))||
  (environment==="live"&&!key.startsWith("rzp_live_")))
  return NextResponse.json({error:"Merchant sandbox/live credentials not enabled"},{status:503});
 try{
  const bearer=req.headers.get("authorization")||"";
  if(!/^Bearer [A-Za-z0-9._-]+$/.test(bearer))
   return NextResponse.json({error:"Signed-in admin JWT required"},{status:401});
  const actor=await verifiedBillingActor(bearer.slice(7));
  const list=await billingAdminRequest<Subscription[]>(
   "saas_tenant_subscriptions?select=org_id,plan_code,state&org_id=eq."+
     actor.orgId+"&limit=1",{},"GET");
  const subscription=list[0];
  if(!subscription||!["trial","pending_payment","grace_period","expired"].includes(subscription.state))
   return NextResponse.json({error:"Subscription does not accept payment"},{status:409});
  const plans=await billingAdminRequest<Plan[]>(
   "saas_annual_plans?select=code,annual_inr&code=eq."+
     subscription.plan_code+"&limit=1",{},"GET");
  const price=Number(plans[0]?.annual_inr);
  if(!Number.isSafeInteger(price*118)||price<=0)
   throw new Error("Invalid official annual plan");
  const id=crypto.randomUUID();
  const auth=Buffer.from(key+":"+secret).toString("base64");
  const response=await fetch("https://api.razorpay.com/v1/orders",{
   method:"POST",headers:{"Authorization":"Basic "+auth,"Content-Type":"application/json"},
   body:JSON.stringify({
    amount:Math.round(price*118),currency:"INR",receipt:"sub_"+id,
    notes:{subscription_org_id:actor.orgId,plan_code:subscription.plan_code}
   }),cache:"no-store",signal:AbortSignal.timeout(9000)
  });
  if(!response.ok)throw new Error("Razorpay order creation failed");
  const provider=await response.json() as {
   id?:string;amount?:number;currency?:string;status?:string
  };
  if(!provider.id||!/^order_[A-Za-z0-9]{5,90}$/.test(provider.id)||
   provider.amount!==Math.round(price*118)||provider.currency!=="INR"||
   provider.status!=="created")throw new Error("Razorpay order receipt mismatch");
  const receipt=await billingAdminRequest<{intent_id:string;amount_paise:number}>(
   "rpc/saas_register_checkout_intent_once",{
    p_intent_id:id,p_org_id:actor.orgId,p_actor_user_id:actor.userId,
    p_plan_code:subscription.plan_code,p_provider_order_id:provider.id,
    p_environment:environment
   });
  if(receipt?.intent_id!==id||Number(receipt.amount_paise)!==provider.amount)
   throw new Error("Merchant order was not durably registered");
  return NextResponse.json({
   provider:"razorpay",orderId:provider.id,amountPaise:provider.amount,
   currency:"INR",environment,publicKeyId:key,basePaise:Math.round(price*100),gstPaise:Math.round(price*18)
  },{headers:{"Cache-Control":"no-store"}});
 }catch{
  return NextResponse.json({error:"Unable to prepare verified checkout"},{status:503});
 }
}
