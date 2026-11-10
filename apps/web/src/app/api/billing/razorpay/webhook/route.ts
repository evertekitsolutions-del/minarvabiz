import {NextRequest,NextResponse} from "next/server";
import {readBoundedWebhookBody} from "@/lib/billing-webhook-body";
import {billingAdminRequest,billingServerReady} from "@/lib/billing-admin-server";
import {verifyRazorpayWebhookSignature,sha256RawWebhook,
 parseCapturedRazorpayEvent} from "@/lib/billing-webhook-signature";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const secret=process.env.RAZORPAY_WEBHOOK_SECRET;
 const env=process.env.RAZORPAY_ENVIRONMENT==="live"?"live":"sandbox";
 if(!secret||(env==="live"&&process.env.MINARVA_LIVE_BILLING_ENABLED!=="true"))
  return NextResponse.json({error:"Billing webhook not configured"},{status:503});
 if(!req.headers.get("content-type")?.includes("application/json"))
  return NextResponse.json({error:"Unsupported payload"},{status:415});
 const length=Number(req.headers.get("content-length")||"0");
 if(!Number.isFinite(length)||length>65536)
  return NextResponse.json({error:"Webhook payload too large"},{status:413});
 let rawBytes:Uint8Array,raw:string;
 try {
  rawBytes=await readBoundedWebhookBody(req);
  raw=new TextDecoder("utf-8",{fatal:true}).decode(rawBytes);
 } catch(error) {
  const tooLarge=error instanceof RangeError;
  return NextResponse.json(
   {error:tooLarge?"Webhook payload too large":"Malformed webhook payload"},
   {status:tooLarge?413:400}
  );
 }
 const sig=req.headers.get("x-razorpay-signature");
 if(!verifyRazorpayWebhookSignature(rawBytes,sig,secret))
  return NextResponse.json({error:"Invalid webhook signature"},{status:401});
 let envelope:ReturnType<typeof parseCapturedRazorpayEvent>;
 try{envelope=parseCapturedRazorpayEvent(raw,req.headers.get("x-razorpay-event-id"));}
 catch{return NextResponse.json({error:"Signed event is not a captured payment"},{status:422});}
 try{
  const result=await billingAdminRequest<{
   receipt_id:string;idempotent:boolean;environment:string
  }>("rpc/saas_capture_signed_subscription_payment_once",{
   p_provider_event_id:envelope.providerEventId,
   p_provider_payment_id:envelope.paymentId,
   p_provider_order_id:envelope.orderId,
   p_amount_paise:envelope.amountPaise,p_currency:"INR",
   p_environment:env,p_raw_body_sha256:sha256RawWebhook(rawBytes)
  });
  if(!result?.receipt_id||result.environment!==env)throw new Error("Verified receipt missing");
  return NextResponse.json({received:true,idempotent:result.idempotent},
   {status:200,headers:{"Cache-Control":"no-store"}});
 }catch{
  // Never acknowledge success without a durable receipt; Razorpay must retry.
  return NextResponse.json({error:"Receipt not committed"},{status:503});
 }
}
