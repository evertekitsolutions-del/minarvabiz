import {createHash,createHmac,timingSafeEqual} from "node:crypto";

/** Razorpay signs the exact incoming HTTP request body, not a parsed JSON object. */
export function verifyRazorpayWebhookSignature(
 rawBody:string|Uint8Array,signature:string|null,webhookSecret:string
):boolean{
 if(!webhookSecret||webhookSecret.length<12||!signature||
  !/^[0-9a-f]{64}$/i.test(signature)||(typeof rawBody==="string"?Buffer.byteLength(rawBody,"utf8"):rawBody.byteLength)>64*1024){
  return false;
 }
 const received=Buffer.from(signature,"hex");
 const expected=createHmac("sha256",webhookSecret).update(rawBody).digest();
 return received.length===expected.length&&timingSafeEqual(received,expected);
}
export function sha256RawWebhook(rawBody:string|Uint8Array):string{
 return createHash("sha256").update(rawBody).digest("hex");
}
export type CapturedPayment={
 event:string;
 payload?:{payment?:{entity?:{
  id?:string;order_id?:string;status?:string;amount?:number;currency?:string
 }}};
};
/** Input validation after HMAC, never before. */
export function parseCapturedRazorpayEvent(rawBody:string,eventId:string|null){
 if(!eventId||!/^[A-Za-z0-9_-]{8,150}$/.test(eventId)){
  throw new Error("Missing or malformed Razorpay event identifier");
 }
 let raw:CapturedPayment;
 try{raw=JSON.parse(rawBody) as CapturedPayment;}
 catch{throw new Error("Malformed signed JSON");}
 const payment=raw?.payload?.payment?.entity;
 if(raw?.event!=="payment.captured"||payment?.status!=="captured"||
  !payment.id||!/^pay_[A-Za-z0-9]{5,100}$/.test(payment.id)||
  !payment.order_id||!/^order_[A-Za-z0-9]{5,90}$/.test(payment.order_id)||
  payment.currency!=="INR"||!Number.isSafeInteger(payment.amount)||
  payment.amount===undefined||payment.amount<=0){
  throw new Error("Only genuine captured INR payment envelopes are supported");
 }
 return {providerEventId:eventId,paymentId:payment.id,
  orderId:payment.order_id,amountPaise:payment.amount,currency:"INR" as const};
}
