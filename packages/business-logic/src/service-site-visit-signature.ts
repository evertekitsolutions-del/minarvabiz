/**
 * SVC-009 — local customer handover acknowledgment, not certified e-signature.
 * The canvas image stays inside the Windows offline snapshot and is NEVER
 * copied to audit events or sent to cloud providers.
 */
export const SITE_VISIT_SIGNATURE_MAX_BYTES = 128 * 1024;
export const SITE_VISIT_HANDOVER_NOTICE =
  "I acknowledge the technician's visit and the explained service outcome. This does not waive warranty or statutory consumer rights.";
export type SiteVisitHandover =
  | {readonly status:"signed";readonly signerName:string;readonly notice:typeof SITE_VISIT_HANDOVER_NOTICE;
     readonly signaturePngBase64:string;readonly reason:null;readonly confirmedAt:string}
  | {readonly status:"declined";readonly signerName:null;readonly notice:typeof SITE_VISIT_HANDOVER_NOTICE;
     readonly signaturePngBase64:null;readonly reason:string;readonly confirmedAt:string};

function field(s:unknown,label:string,max:number):string{
  if(typeof s!=="string"||s.trim().length===0||s.length>max||/[\u0000-\u001f\u007f]/.test(s))
    throw new Error("Invalid handover "+label);
  return s.trim();
}
function instant(s:unknown):string{
  if(typeof s!=="string"||!/^20\d{2}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(s)||
    !Number.isFinite(Date.parse(s)))throw new Error("Invalid handover timestamp");
  return s;
}
export function validateHandoverPng(input:unknown):string{
  if(typeof input!=="string"||input.length>4*Math.ceil(SITE_VISIT_SIGNATURE_MAX_BYTES/3)||
     input.length%4!==0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input))
    throw new Error("Invalid handover PNG base64");
  let bytes:string;
  try{bytes=atob(input);}catch{throw new Error("Invalid handover PNG base64");}
  if(bytes.length<57||bytes.length>SITE_VISIT_SIGNATURE_MAX_BYTES||btoa(bytes)!==input)
    throw new Error("Invalid handover PNG image size");
  const at=(n:number)=>bytes.charCodeAt(n);
  if(!bytes.startsWith("\x89PNG\r\n\x1a\n")||
    at(8)!==0||at(9)!==0||at(10)!==0||at(11)!==13||
    bytes.slice(12,16)!=="IHDR"||
    bytes.slice(-8,-4)!=="IEND")
    throw new Error("Invalid handover PNG header or trailer");
  const uint32=(i:number)=>(
    (at(i)*0x1000000)+(at(i+1)<<16)+(at(i+2)<<8)+at(i+3)
  )>>>0;
  const width=uint32(16),height=uint32(20);
  if(width<32||height<32||width>2048||height>2048)
    throw new Error("Invalid handover PNG dimensions");
  return input;
}
export function validateSiteVisitHandover(raw:unknown,arrivedAt:string|null,
  updatedAt:string,status:string):SiteVisitHandover|null{
  if(raw===null)return null;
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("Invalid handover entry");
  const v=raw as Record<string,unknown>;
  if(Object.keys(v).some(k=>!["status","signerName","notice","signaturePngBase64","reason","confirmedAt"].includes(k)))
    throw new Error("Unknown handover field");
  if(v.notice!==SITE_VISIT_HANDOVER_NOTICE)throw new Error("Handover notice mismatch");
  if(!arrivedAt||!["arrived","completed"].includes(status))
    throw new Error("Handover requires arrived site visit");
  const confirmedAt=instant(v.confirmedAt);
  if(confirmedAt<arrivedAt||confirmedAt>updatedAt)
    throw new Error("Handover timestamp outside visit chronology");
  if(v.status==="signed"){
    if(v.reason!==null)throw new Error("Signed handover cannot contain decline reason");
    const signerName=field(v.signerName,"signer",120);
    const signaturePngBase64=validateHandoverPng(v.signaturePngBase64);
    return {status:"signed",signerName,notice:SITE_VISIT_HANDOVER_NOTICE,
      signaturePngBase64,reason:null,confirmedAt};
  }
  if(v.status==="declined"){
    if(v.signerName!==null||v.signaturePngBase64!==null)
      throw new Error("Declined handover cannot include signature");
    const reason=field(v.reason,"decline reason",400);
    if(reason.length<3)throw new Error("Declined handover needs reason");
    return {status:"declined",signerName:null,notice:SITE_VISIT_HANDOVER_NOTICE,
      signaturePngBase64:null,reason,confirmedAt};
  }
  throw new Error("Invalid handover result");
}
export function handoverImageBytes(v:SiteVisitHandover|null|undefined):number{
  return v?.status==="signed"?Math.floor(v.signaturePngBase64.length*3/4)-
    (v.signaturePngBase64.endsWith("==")?2:v.signaturePngBase64.endsWith("=")?1:0):0;
}
export function safeHandoverAudit(v:SiteVisitHandover|null|undefined){
  if(!v)return null;
  return {status:v.status,signerName:v.signerName,
    confirmedAt:v.confirmedAt,notice:v.notice,
    signatureCaptured:v.status==="signed",reason:v.reason};
}
