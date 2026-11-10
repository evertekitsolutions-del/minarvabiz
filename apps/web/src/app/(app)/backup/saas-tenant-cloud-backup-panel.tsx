"use client";
import * as React from "react";
import {configFromEnv,pgRpc} from "@minarvabiz/database";
import {can,getSessionToken,getSessionUser,getOutboxScope} from "@minarvabiz/business-logic";
import {resolveOnlineAuthorization} from "../../../lib/data-source";
type Archive={format:string;schema_version:number;org_id:string;sha256:string;created_at:string;records:Record<string,Record<string,unknown>[]>};
type Validation={valid:boolean;non_destructive:boolean;restore_applied:boolean;sha256:string;row_counts:Record<string,number>};
const safeCell=(v:unknown)=>{
 const s=v===null||v===undefined?"":typeof v==="object"?JSON.stringify(v):String(v);
 const escaped=/^[\t\r\n =+\-@]/.test(s)?"'"+s:s;
 return '"'+escaped.replaceAll('"','""')+'"';
};
function download(name:string,mime:string,body:string){
 const url=URL.createObjectURL(new Blob([body],{type:mime}));
 const anchor=document.createElement("a");
 anchor.href=url;anchor.download=name;document.body.appendChild(anchor);
 try{anchor.click()}finally{anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),2000)}
}
export function SaasTenantCloudBackupPanel(){
 const [busy,setBusy]=React.useState(false);
 const [error,setError]=React.useState("");
 const [notice,setNotice]=React.useState("");
 const [summary,setSummary]=React.useState<Validation|null>(null);
 const action=React.useRef(false);
 async function context(){
  const cfg=configFromEnv(),token=getSessionToken(),user=getSessionUser();
  if(!cfg||!token||!user?.id)throw new Error("Signed-in cloud backup required.");
  const auth=await resolveOnlineAuthorization(token,user.id);
  if(!auth.ok||!can("backup.manage")||getOutboxScope()!==auth.orgId+":"+user.id)
   throw new Error("Tenant admin backup permission required.");
  return {cfg:{...cfg,accessToken:token},token,userId:user.id,org:auth.orgId};
 }
 function sessionOkay(token:string,userId:string){
  if(token!==getSessionToken()||userId!==getSessionUser()?.id)throw new Error("Session changed; no backup exported.");
 }
 async function exportArchive(kind:"json"|"csv"){
  if(action.current)return;
  if(!window.confirm("The cloud archive contains confidential customer and transaction records. Save it securely. Continue?"))return;
  action.current=true;setBusy(true);setError("");setNotice("");setSummary(null);
  try{
   const a=await context();
   const r=await pgRpc<Archive>(a.cfg,"saas_tenant_backup_export",{p_row_limit:1000});
   if(r.error||!r.data)throw new Error(r.error?.message||"Cloud export RPC failed.");
   const archive=r.data;
   if(archive.format!=="minarva-tenant-archive"||archive.org_id!==a.org)
    throw new Error("Cloud backup tenant validation failed.");
   const verified=await pgRpc<Validation>(a.cfg,"saas_tenant_backup_validate",{p_archive:archive});
   if(verified.error||verified.data?.valid!==true||
     verified.data.sha256!==archive.sha256||verified.data.restore_applied!==false)
    throw new Error(verified.error?.message||"Cloud backup integrity verification failed.");
   sessionOkay(a.token,a.userId);
   const file="minarva-cloud-"+new Date().toISOString().slice(0,10)+"-"+a.org.slice(0,8);
   if(kind==="json"){
    download(file+".json","application/json",JSON.stringify(archive));
   }else{
    const lines=["collection,id,org_id,record_json"];
    for(const [table,items] of Object.entries(archive.records)){
     for(const item of items)lines.push([table,item.id,item.org_id,item].map(safeCell).join(","));
    }
    download(file+".csv","text/csv;charset=utf-8","\uFEFF"+lines.join("\r\n"));
   }
   setSummary(verified.data);
   setNotice("Tenant cloud export verified and download requested. This is a bounded per-table snapshot, not an automated database disaster-recovery backup.");
  }catch(e){setError(e instanceof Error?e.message:"Cloud backup not verified.");}
  finally{action.current=false;setBusy(false);}
 }
 async function verifyFile(file:File|null){
  if(!file||action.current)return;
  action.current=true;setBusy(true);setError("");setNotice("");setSummary(null);
  try{
   if(file.size>12*1024*1024)throw new Error("Archive exceeds 12 MB validation limit.");
   const archive:unknown=JSON.parse(await file.text());
   const a=await context();
   const r=await pgRpc<Validation>(a.cfg,"saas_tenant_backup_validate",{p_archive:archive});
   if(r.error||!r.data?.valid||r.data.restore_applied!==false)
    throw new Error(r.error?.message||"Archive restore preflight validation failed.");
   sessionOkay(a.token,a.userId);
   setSummary(r.data);
   setNotice("Restore preflight passed for your tenant. No live data was overwritten, merged or restored.");
  }catch(e){setError(e instanceof Error?e.message:"Invalid tenant archive.");}
  finally{action.current=false;setBusy(false);}
 }
 return <section className="space-y-3 rounded-xl border bg-white p-4">
  <h2 className="font-semibold">Online tenant backup & restore preflight</h2>
  <p className="text-xs text-slate-600">Cloud-only, authenticated administrator. Bounded to 1,000 rows per collection; use a managed PostgreSQL backup for full disaster recovery. Restore is validation-only and cannot modify production data.</p>
  <div className="flex flex-wrap gap-2">
   <button type="button" disabled={busy} onClick={()=>{void exportArchive("json")}}
    className="min-h-[44px] rounded bg-slate-900 px-4 text-white disabled:opacity-50">Export verified JSON</button>
   <button type="button" disabled={busy} onClick={()=>{void exportArchive("csv")}}
    className="min-h-[44px] rounded border px-4 disabled:opacity-50">Export CSV</button>
  </div>
  <label className="block text-sm">Validate previously downloaded tenant JSON (no writes)
   <input type="file" accept=".json,application/json" disabled={busy}
    className="mt-1 block w-full rounded border p-2" onChange={e=>{void verifyFile(e.target.files?.[0]??null)}}/>
  </label>
  {summary&&<p className="text-sm">SHA256 verified · {Object.entries(summary.row_counts).map(([k,v])=>k+": "+v).join(" · ")}</p>}
  {notice&&<p role="status" className="text-sm text-green-700">{notice}</p>}
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </section>;
}
