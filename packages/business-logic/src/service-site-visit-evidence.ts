/**
 * SVC-008 — bounded offline photo/document evidence bytes in a site visit.
 * Raw files are never embedded in audit events, links, URLs or network writes.
 * This is a storage/format check, NOT legal authenticity or malware scanning.
 */
export const SITE_EVIDENCE_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const SITE_EVIDENCE_MAX_VISIT_FILES = 6;
export const SITE_EVIDENCE_MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024;
export type SiteEvidenceMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
export type SiteEvidencePurpose = "before" | "after" | "diagnostic" | "document";
export interface ServiceSiteVisitEvidence {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: SiteEvidenceMime;
  readonly purpose: SiteEvidencePurpose;
  readonly notes: string;
  readonly byteLength: number;
  readonly dataBase64: string;
  readonly uploadedAt: string;
}
const suffixes:Record<SiteEvidenceMime,RegExp>={
  "image/jpeg":/\.jpe?g$/i,"image/png":/\.png$/i,
  "image/webp":/\.webp$/i,"application/pdf":/\.pdf$/i,
};
function timestamp(value:unknown):string{
  if(typeof value!=="string"||!/^20\d{2}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(value)||
     !Number.isFinite(Date.parse(value)))throw new Error("Invalid evidence timestamp");
  return value;
}
function textField(value:unknown,name:string,max:number,required=false):string{
  if(typeof value!=="string"||value.length>max||/[\u0000-\u001f\u007f]/.test(value)||
     (required&&!value.trim()))throw new Error("Invalid evidence "+name);
  return value.trim();
}
export function validateServiceVisitEvidence(value:unknown):ServiceSiteVisitEvidence{
  if(!value||typeof value!=="object"||Array.isArray(value))
    throw new Error("Invalid evidence record");
  const e=value as Record<string,unknown>;
  const expected=["id","fileName","mimeType","purpose","notes","byteLength","dataBase64","uploadedAt"];
  if(Object.keys(e).some(k=>!expected.includes(k)))throw new Error("Unknown evidence field");
  const id=textField(e.id,"id",128,true);
  if(!/^[a-zA-Z0-9_-]{1,128}$/.test(id))throw new Error("Invalid evidence ID");
  const fileName=textField(e.fileName,"file name",160,true);
  if(fileName==="."||fileName===".."||/[\/\\:<>|?*]/.test(fileName))
    throw new Error("Unsafe evidence file name");
  const mimeType=e.mimeType as SiteEvidenceMime;
  if(!Object.hasOwn(suffixes,mimeType)||!suffixes[mimeType].test(fileName))
    throw new Error("Unsupported evidence file type");
  const purpose=e.purpose as SiteEvidencePurpose;
  if(!["before","after","diagnostic","document"].includes(purpose))
    throw new Error("Invalid evidence purpose");
  const notes=textField(e.notes,"notes",500);
  const byteLength=e.byteLength;
  if(typeof byteLength!=="number"||!Number.isSafeInteger(byteLength)||
     byteLength<16||byteLength>SITE_EVIDENCE_MAX_FILE_BYTES)
    throw new Error("Evidence file exceeds allowed size or is empty");
  const dataBase64=e.dataBase64;
  if(typeof dataBase64!=="string"||dataBase64.length>4*Math.ceil(SITE_EVIDENCE_MAX_FILE_BYTES/3)||
    dataBase64.length%4!==0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(dataBase64))
    throw new Error("Invalid evidence base64");
  let decoded:string;
  try{decoded=atob(dataBase64);}catch{throw new Error("Invalid evidence base64");}
  if(decoded.length!==byteLength||btoa(decoded)!==dataBase64)
    throw new Error("Evidence payload length or encoding mismatch");
  const code=(i:number)=>decoded.charCodeAt(i);
  const starts=(v:string)=>decoded.startsWith(v);
  const signature=
    mimeType==="image/jpeg" ? code(0)===255&&code(1)===216&&code(2)===255 :
    mimeType==="image/png" ? byteLength>=24&&decoded.startsWith("\x89PNG\r\n\x1a\n")&&
      decoded.slice(12,16)==="IHDR" :
    mimeType==="image/webp" ? byteLength>=16&&starts("RIFF")&&decoded.slice(8,12)==="WEBP" :
    starts("%PDF-");
  if(!signature)throw new Error("Evidence file content does not match its declared type");
  const uploadedAt=timestamp(e.uploadedAt);
  return {id,fileName,mimeType,purpose,notes,byteLength,dataBase64,uploadedAt};
}
export function validateServiceVisitEvidenceList(value:unknown,
  arrivedAt:string|null,updatedAt:string,status:string):ServiceSiteVisitEvidence[]{
  if(!Array.isArray(value)||value.length>SITE_EVIDENCE_MAX_VISIT_FILES)
    throw new Error("Invalid site visit evidence collection");
  if(value.length&&(!arrivedAt||!["arrived","completed"].includes(status)))
    throw new Error("Evidence requires arrived or completed site visit");
  const seen=new Set<string>();
  return value.map(raw=>{
    const e=validateServiceVisitEvidence(raw);
    if(seen.has(e.id))throw new Error("Duplicate site visit evidence");
    seen.add(e.id);
    if(!arrivedAt||e.uploadedAt<arrivedAt||e.uploadedAt>updatedAt)
      throw new Error("Evidence timestamp outside visit chronology");
    return e;
  });
}
export function serviceVisitEvidenceBytes(items:readonly ServiceSiteVisitEvidence[]):number{
  return items.reduce((total,item)=>total+item.byteLength,0);
}
