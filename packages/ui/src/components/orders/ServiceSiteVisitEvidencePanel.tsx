"use client";
import * as React from "react";
import {
  addServiceSiteVisitEvidence, removeServiceSiteVisitEvidence,
  SITE_EVIDENCE_MAX_FILE_BYTES, SITE_EVIDENCE_MAX_VISIT_FILES,
  type ServiceSiteVisit, type ServiceSiteVisitEvidence,
  type SiteEvidenceMime, type SiteEvidencePurpose,
} from "@minarvabiz/business-logic";
import {Button} from "../Button";
import {inputClass,selectClass} from "../forms/FormField";

const MIME_BY_SUFFIX:ReadonlyArray<[RegExp,SiteEvidenceMime]>=[
  [/\.jpe?g$/i,"image/jpeg"],[/\.png$/i,"image/png"],
  [/\.webp$/i,"image/webp"],[/\.pdf$/i,"application/pdf"],
];
function fileMime(file:File):SiteEvidenceMime|null{
  const match=MIME_BY_SUFFIX.find(([test])=>test.test(file.name));
  if(!match)return null;
  return (!file.type||file.type===match[1])?match[1]:null;
}
function EvidenceRow({record,allowRemove,remove}:{
  record:ServiceSiteVisitEvidence;
  allowRemove:boolean;
  remove:(id:string,reason:string)=>void;
}){
  const [reason,setReason]=React.useState("");
  const [confirm,setConfirm]=React.useState(false);
  const [error,setError]=React.useState<string|null>(null);
  function download(){
    try{
      const raw=atob(record.dataBase64);
      const bytes=new Uint8Array(raw.length);
      for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
      const blob=new Blob([bytes],{type:record.mimeType});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url;link.download=record.fileName;link.rel="noopener";
      document.body.appendChild(link);
      try{link.click();}
      finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
      setError(null);
    }catch(e){
      setError(e instanceof Error?e.message:"Evidence download failed");
    }
  }
  return <div className="mt-1 border-t border-slate-100 py-2 text-xs">
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium break-all">{record.fileName}</span>
      <span className="text-slate-500">({Math.ceil(record.byteLength/1024)} KiB,
        {" "}{record.purpose})</span>
      <Button size="sm" variant="outline" onClick={download}>Download</Button>
      {allowRemove&&<Button size="sm" variant="outline"
        onClick={()=>setConfirm(v=>!v)}>Remove</Button>}
    </div>
    {record.notes&&<p className="mt-1 text-slate-500">{record.notes}</p>}
    {confirm&&<div className="mt-2 flex flex-wrap items-end gap-1">
      <label className="text-xs font-medium">Removal reason
        <input aria-label={"Removal reason "+record.fileName}
          className={inputClass+" mt-1"} maxLength={500} value={reason}
          onChange={e=>setReason(e.target.value)}/>
      </label>
      <Button size="sm" variant="outline" disabled={reason.trim().length<3}
        onClick={()=>remove(record.id,reason)}>Confirm removal</Button>
      <Button size="sm" variant="outline" onClick={()=>setConfirm(false)}>Keep</Button>
    </div>}
    {error&&<p role="alert" className="mt-1 text-rose-700">{error}</p>}
  </div>;
}

/** SVC-008: explicitly user-selected offline file data, no cloud upload or auto-share. */
export function ServiceSiteVisitEvidencePanel({visit,canWrite,mutate}:{
  visit:ServiceSiteVisit;canWrite:boolean;
  mutate:(fn:()=>unknown,success:string)=>void;
}){
  const [purpose,setPurpose]=React.useState<SiteEvidencePurpose>("diagnostic");
  const [notes,setNotes]=React.useState("");
  const [error,setError]=React.useState<string|null>(null);
  const [reading,setReading]=React.useState(false);
  const files=visit.evidence??[];
  const editable=canWrite&&visit.status==="arrived";
  function addFile(file:File|null){
    if(!file)return;
    setError(null);
    if(!editable){setError("Evidence editing requires an arrived site visit");return;}
    const mime=fileMime(file);
    if(!mime){setError("Choose a JPG, PNG, WebP or PDF with the matching file type");return;}
    if(file.size<16||file.size>SITE_EVIDENCE_MAX_FILE_BYTES){
      setError("File must be under 2 MiB and contain real image/document data");
      return;
    }
    if(files.length>=SITE_EVIDENCE_MAX_VISIT_FILES){
      setError("Maximum of six attachments per visit");return;
    }
    setReading(true);
    const reader=new FileReader();
    reader.onerror=()=>{
      setReading(false);
      setError("Could not read the selected local file");
    };
    reader.onload=()=>{
      setReading(false);
      if(typeof reader.result!=="string"){
        setError("Selected file did not contain expected binary data");return;
      }
      const prefix="data:"+mime+";base64,";
      if(!reader.result.startsWith(prefix)){
        setError("File reader MIME does not match the selected file");return;
      }
      const dataBase64=reader.result.slice(prefix.length);
      mutate(()=>addServiceSiteVisitEvidence({
        visitId:visit.id,expectedVersion:visit.version,fileName:file.name,
        mimeType:mime,purpose,notes,byteLength:file.size,dataBase64,
      }),"Offline photo/document evidence saved");
    };
    reader.readAsDataURL(file);
  }
  return <details className="mt-2 max-w-96 rounded border border-slate-200 bg-white p-2">
    <summary className="cursor-pointer font-medium">Photo / document evidence ({files.length})</summary>
    <p className="my-1 text-xs text-slate-500">
      Local Windows evidence only; do not attach sensitive files without consent.
      Image metadata may include location. File content is not independently certified.
    </p>
    {editable&&<div className="space-y-2">
      <label className="block text-xs font-medium">Evidence category
        <select aria-label={"Evidence category "+visit.id} className={selectClass+" mt-1"}
          value={purpose} onChange={e=>setPurpose(e.target.value as SiteEvidencePurpose)}>
          <option value="before">Before service</option>
          <option value="after">After service</option>
          <option value="diagnostic">Diagnostic</option>
          <option value="document">Document</option>
        </select>
      </label>
      <label className="block text-xs font-medium">Evidence notes
        <input aria-label={"Evidence notes "+visit.id} className={inputClass+" mt-1"}
          value={notes} maxLength={500} onChange={e=>setNotes(e.target.value)}/>
      </label>
      <label className="block text-xs font-medium">Attach JPG / PNG / WebP / PDF (2 MiB max)
        <input aria-label={"Attach site evidence "+visit.id}
          className="mt-1 block w-full max-w-64 text-xs" type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
          disabled={reading||files.length>=SITE_EVIDENCE_MAX_VISIT_FILES}
          onChange={e=>{
            const field=e.currentTarget;
            const selected=field.files?.[0]??null;
            field.value="";
            addFile(selected);
          }}/>
      </label>
      <p className="text-xs text-slate-500">
        Files are saved in the offline SQLite backup, not uploaded automatically.
      </p>
    </div>}
    {files.length===0&&<p className="mt-2 text-xs text-slate-500">No site evidence yet.</p>}
    {files.map(record=><EvidenceRow key={record.id} record={record}
      allowRemove={editable}
      remove={(id,reason)=>mutate(()=>removeServiceSiteVisitEvidence({
        visitId:visit.id,expectedVersion:visit.version,evidenceId:id,reason,
      }),"Evidence removed with audit reason")}/>)}
    {reading&&<p role="status" className="text-xs text-slate-600">Reading local file…</p>}
    {error&&<p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
  </details>;
}
