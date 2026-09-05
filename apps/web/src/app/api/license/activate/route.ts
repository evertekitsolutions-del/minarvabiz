import { NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const DEVICE_RE = /^[a-f0-9]{64}$/;
function clean(v: unknown, max=2000){ return typeof v === "string" ? v.trim().slice(0,max) : ""; }
function db(){ const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY; return url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}):null; }
export async function POST(request:Request){
  try{
    const body=await request.json(); const token=clean(body?.licenseToken); const deviceId=clean(body?.deviceId,64).toLowerCase();
    if(!token||!DEVICE_RE.test(deviceId)) return NextResponse.json({ok:false,code:"INVALID_REQUEST"},{status:400});
    const supabase=db(); if(!supabase) return NextResponse.json({ok:false,code:"SERVICE_NOT_CONFIGURED"},{status:503});
    const hash=createHash("sha256").update(token,"utf8").digest("hex");
    const {data:license}=await supabase.from("licenses").select("id,license_id,customer_id,product,edition,plan,status,expires_at,activation_limit,features").eq("token_sha256",hash).maybeSingle();
    if(!license) return NextResponse.json({ok:false,code:"INVALID_LICENSE"},{status:401});
    if(license.product!=="minarvabiz") return NextResponse.json({ok:false,code:"INVALID_PRODUCT"},{status:403});
    if(license.status!=="active") return NextResponse.json({ok:false,code:license.status.toUpperCase(),status:license.status},{status:403});
    if(license.expires_at&&new Date(license.expires_at).getTime()<=Date.now()) { await supabase.from("licenses").update({status:"expired"}).eq("id",license.id); return NextResponse.json({ok:false,code:"EXPIRED"},{status:403}); }
    const {data:existing}=await supabase.from("license_activations").select("id,activation_id,status").eq("license_id",license.id).eq("device_id",deviceId).maybeSingle();
    const now=new Date().toISOString();
    if(existing?.status==="active") return NextResponse.json({ok:true,status:"active",licenseId:license.license_id,activationId:existing.activation_id,plan:license.plan,edition:license.edition,expiresAt:license.expires_at,features:license.features,validatedAt:now});
    const {count}=await supabase.from("license_activations").select("id",{count:"exact",head:true}).eq("license_id",license.id).eq("status","active");
    if((count||0)>=license.activation_limit) return NextResponse.json({ok:false,code:"ACTIVATION_LIMIT_REACHED"},{status:409});
    const activationId=randomUUID();
    const {data:activation,error}=await supabase.from("license_activations").insert({id:randomUUID(),license_id:license.id,activation_id:activationId,device_id:deviceId,status:"active",activated_at:now,last_validated_at:now}).select("activation_id").single();
    if(error||!activation) return NextResponse.json({ok:false,code:"ACTIVATION_FAILED"},{status:409});
    await supabase.from("license_events").insert({id:randomUUID(),license_id:license.id,event_type:"activated",device_id:deviceId,actor:"desktop",details:{activationId}});
    return NextResponse.json({ok:true,status:"active",licenseId:license.license_id,customerId:license.customer_id,activationId,plan:license.plan,edition:license.edition,expiresAt:license.expires_at,features:license.features,validatedAt:now});
  }catch{return NextResponse.json({ok:false,code:"INVALID_REQUEST"},{status:400});}
}
