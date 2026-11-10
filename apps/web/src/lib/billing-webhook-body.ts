/**
 * Read the exact Razorpay webhook octets with a strict memory cap.
 * Content-Length is optional and attacker-controlled; enforce max bytes during streaming.
 * No partial payload is returned on failure, and requests are never cached.
 */
export async function readBoundedWebhookBody(
 request:Request,maxBytes=65536
):Promise<Uint8Array>{
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new TypeError("Invalid webhook limit");
 if(!request.body)throw new TypeError("Webhook body is missing");
 const reader=request.body.getReader();
 const chunks:Uint8Array[]=[];
 let count=0;
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array))throw new TypeError("Non-byte webhook chunk");
   if(value.byteLength>maxBytes-count)throw new RangeError("Webhook payload exceeds byte limit");
   count+=value.byteLength;
   chunks.push(value);
  }
 }catch(error){
  await reader.cancel().catch(()=>{});
  throw error;
 }finally{reader.releaseLock();}
 const combined=new Uint8Array(count);
 let offset=0;
 for(const part of chunks){combined.set(part,offset);offset+=part.byteLength;}
 return combined;
}
