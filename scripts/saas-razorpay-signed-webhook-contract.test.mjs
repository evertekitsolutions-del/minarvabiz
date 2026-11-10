import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {readBoundedWebhookBody} from "../apps/web/src/lib/billing-webhook-body.ts";
import {readFileSync} from "node:fs";
import {verifyRazorpayWebhookSignature,sha256RawWebhook,
 parseCapturedRazorpayEvent} from "../apps/web/src/lib/billing-webhook-signature.ts";

const secret="M20_qa_webhook_secret_for_tests_Only_2026";
const payload={event:"payment.captured",payload:{payment:{entity:{
 id:"pay_qa2026abcd",order_id:"order_qa2026abcd",amount:229900,
 currency:"INR",status:"captured"
}}}};
const raw=JSON.stringify(payload);
const signature=createHmac("sha256",secret).update(raw,"utf8").digest("hex");
test("M22 exactly raw payload HMAC-SHA256 succeeds with known test secret",()=>{
 assert.equal(verifyRazorpayWebhookSignature(raw,signature,secret),true);
 assert.equal(verifyRazorpayWebhookSignature(new TextEncoder().encode(raw),signature,secret),true);
 assert.equal(sha256RawWebhook(new TextEncoder().encode(raw)),sha256RawWebhook(raw));
 assert.equal(sha256RawWebhook(raw).length,64);
 assert.deepEqual(parseCapturedRazorpayEvent(raw,"evt_qa2026abcd"),{
  providerEventId:"evt_qa2026abcd",paymentId:"pay_qa2026abcd",
  orderId:"order_qa2026abcd",amountPaise:229900,currency:"INR"
 });
});
test("M22 rejects unsigned/forged/tampered/oversized/malformed events",()=>{
 assert.equal(verifyRazorpayWebhookSignature(raw,null,secret),false);
 assert.equal(verifyRazorpayWebhookSignature(raw,"0".repeat(64),secret),false);
 assert.equal(verifyRazorpayWebhookSignature(raw+" ",signature,secret),false);
 assert.equal(verifyRazorpayWebhookSignature(raw,signature,"another secret"),false);
 assert.equal(verifyRazorpayWebhookSignature("x".repeat(65537),signature,secret),false);
 assert.equal(verifyRazorpayWebhookSignature(raw,"not-hex",secret),false);
 assert.throws(()=>parseCapturedRazorpayEvent(raw,"not an id"));
 assert.throws(()=>parseCapturedRazorpayEvent(JSON.stringify({...payload,event:"payment.authorized"}),"evt_qa2026abcd"));
 assert.throws(()=>parseCapturedRazorpayEvent(JSON.stringify({
  event:"payment.captured",payload:{payment:{entity:{...payload.payload.payment.entity,status:"authorized"}}}}),"evt_qa2026abcd"));
});
test("M22 actual server webhook verifies signature BEFORE parsing or database call",()=>{
 const route=readFileSync("apps/web/src/app/api/billing/razorpay/webhook/route.ts","utf8");
 const checkout=readFileSync("apps/web/src/app/api/billing/checkout/route.ts","utf8");
 const admin=readFileSync("apps/web/src/lib/billing-admin-server.ts","utf8");
 const sql=readFileSync("supabase/migrations/20261110_saas_signed_payment_receipts_commissions.sql","utf8");
 const gst=readFileSync("supabase/migrations/20261110_saas_annual_gst_referral_base_fix.sql","utf8");
 assert.ok(route.indexOf("verifyRazorpayWebhookSignature(rawBytes")<route.indexOf("parseCapturedRazorpayEvent(raw"));
 assert.ok(route.indexOf("parseCapturedRazorpayEvent(raw")<route.indexOf("billingAdminRequest<"));
 for(const re of [
 /process\.env\.RAZORPAY_WEBHOOK_SECRET/,/RAZORPAY_ENVIRONMENT/,
 /MINARVA_LIVE_BILLING_ENABLED/,/x-razorpay-signature/,
 /x-razorpay-event-id/,/saas_capture_signed_subscription_payment_once/,
 /Receipt not committed/,/status:503/,/raw_body_sha256/
 ])assert.match(route,re);
 for(const re of [
 /verifiedBillingActor/,/saas_register_checkout_intent_once/,
 /https:\/\/api\.razorpay\.com\/v1\/orders/,/process\.env\.RAZORPAY_KEY_SECRET/,
 /response\.ok/,/provider\.amount!==Math\.round\(price\*118\)/,
 ])assert.match(checkout,re);
 assert.match(admin,/SUPABASE_SERVICE_ROLE_KEY/);
 assert.doesNotMatch(admin,/NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
 for(const re of [
  /provider_event_id text NOT NULL UNIQUE/,
  /provider_payment_id text NOT NULL UNIQUE/,
  /provider_order_id text NOT NULL UNIQUE/,
  /intent_id uuid NOT NULL UNIQUE/,
  /v_old\.raw_body_sha256<>p_raw_body_sha256/,
  /saas_capture_signed_subscription_payment_once/,
  /record_partner_referral_commission/,
  /commission_rate numeric\(5,2\) NOT NULL DEFAULT 10/,
  /commission_inr/,/sandbox_not_payable/,
  /state='active'/,/payment_environment=p_environment/,
  /REVOKE ALL ON FUNCTION public\.saas_register_checkout_intent_once/,
  /TO service_role/
 ])assert.match(sql,re);
 assert.match(gst,/annual_inr\*118/);
 assert.match(gst,/annual_inr\*0\.10/);
 assert.match(gst,/base_amount_paise/);
 assert.match(gst,/gst_amount_paise/);
 assert.doesNotMatch(sql,/GRANT EXECUTE .* TO anon/);
});

test("M22 streaming cap rejects chunked oversized body even without Content-Length",async()=>{
 const body=new ReadableStream({
  start(controller){
   controller.enqueue(new Uint8Array(40000));
   controller.enqueue(new Uint8Array(25537));
   controller.close();
  }
 });
 const req=new Request("https://minarvabiz.com/api/billing/razorpay/webhook",{
  method:"POST",body,duplex:"half"
 });
 await assert.rejects(()=>readBoundedWebhookBody(req),RangeError);
});
test("M22 exact 64KB payload survives bounded streaming; no normalization",async()=>{
 const bytes=new Uint8Array(65536);
 bytes.fill(97);
 const req=new Request("https://minarvabiz.com/api/billing/razorpay/webhook",{
  method:"POST",body:bytes,duplex:"half"
 });
 const data=await readBoundedWebhookBody(req);
 assert.equal(data.length,65536);
 assert.deepEqual(data,bytes);
 const rawBuffer=Buffer.from("payload with €", "utf8");
 const req2=new Request("https://minarvabiz.com/api/billing/razorpay/webhook",{
  method:"POST",body:rawBuffer,duplex:"half"
 });
 const exact=await readBoundedWebhookBody(req2);
 assert.deepEqual(Buffer.from(exact),rawBuffer);
});
test("M22 payload body reader is used before signature evaluation",()=>{
 const route=readFileSync("apps/web/src/app/api/billing/razorpay/webhook/route.ts","utf8");
 assert.match(route,/readBoundedWebhookBody\(req\)/);
 assert.match(route,/verifyRazorpayWebhookSignature\(rawBytes/);
 assert.match(route,/sha256RawWebhook\(rawBytes\)/);
 assert.doesNotMatch(route,/await req\.text\(\)/);
});
