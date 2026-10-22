"use client";
import * as React from "react";
import {
  captureServiceVisitSignature, recordServiceVisitSignatureDecline,
  SITE_VISIT_HANDOVER_NOTICE, type ServiceSiteVisit,
} from "@minarvabiz/business-logic";
import {Button} from "../Button";
import {inputClass} from "../forms/FormField";

const W=560,H=180;
function penBackground(c:HTMLCanvasElement){
  const ctx=c.getContext("2d");
  if(!ctx)throw new Error("Canvas drawing is unavailable");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,W,H);
  ctx.strokeStyle="#111827";ctx.lineWidth=2.5;
  ctx.lineCap="round";ctx.lineJoin="round";
}
function downloadSignature(data:string){
  const binary=atob(data);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  const url=URL.createObjectURL(new Blob([bytes],{type:"image/png"}));
  const a=document.createElement("a");a.href=url;
  a.download="service-handover-signature.png";a.rel="noopener";
  document.body.appendChild(a);
  try{a.click();}finally{a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
export function ServiceVisitSignaturePanel({visit,canWrite,mutate}:{
  visit:ServiceSiteVisit;canWrite:boolean;mutate:(f:()=>unknown,msg:string)=>void;
}){
  const canvas=React.useRef<HTMLCanvasElement|null>(null);
  const last=React.useRef<{x:number;y:number}|null>(null);
  const [ink,setInk]=React.useState(false);
  const [signer,setSigner]=React.useState("");
  const [consent,setConsent]=React.useState(false);
  const [declineReason,setDeclineReason]=React.useState("");
  const [error,setError]=React.useState<string|null>(null);
  const existing=visit.handover;
  const editable=canWrite&&visit.status==="arrived"&&
    Object.hasOwn(visit,"handover")&&existing===null;
  React.useEffect(()=>{
    if(canvas.current&&editable)penBackground(canvas.current);
  },[editable,visit.id]);
  function point(e:React.PointerEvent<HTMLCanvasElement>){
    const c=e.currentTarget,r=c.getBoundingClientRect();
    if(r.width===0||r.height===0)return null;
    return {x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};
  }
  function down(e:React.PointerEvent<HTMLCanvasElement>){
    if(!editable)return;
    last.current=point(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e:React.PointerEvent<HTMLCanvasElement>){
    if(!editable||!last.current)return;
    const next=point(e),ctx=canvas.current?.getContext("2d");
    if(!next||!ctx)return;
    ctx.beginPath();ctx.moveTo(last.current.x,last.current.y);
    ctx.lineTo(next.x,next.y);ctx.stroke();last.current=next;
    setInk(true);
  }
  function release(){
    last.current=null;
  }
  function clear(){
    if(canvas.current)penBackground(canvas.current);
    release();setInk(false);setError(null);
  }
  function save(){
    if(!canvas.current||!ink||!signer.trim()||!consent)return;
    try{
      const image=canvas.current.toDataURL("image/png");
      if(!image.startsWith("data:image/png;base64,"))
        throw new Error("Could not generate a PNG signature");
      setError(null);
      mutate(()=>captureServiceVisitSignature({
        visitId:visit.id,expectedVersion:visit.version,
        signerName:signer,signaturePngBase64:image.slice("data:image/png;base64,".length),
      }),"Customer handover signature saved in local Windows register");
    }catch(e){setError(e instanceof Error?e.message:"Signature save failed");}
  }
  if(!Object.hasOwn(visit,"handover"))return null; // Historical visit, no forced retrofit
  return <details className="mt-2 max-w-[600px] rounded border border-slate-200 bg-white p-2">
    <summary className="cursor-pointer font-medium">
      Customer handover: {existing?.status==="signed"?"Signed":
        existing?.status==="declined"?"Declined":"Awaiting acknowledgment"}
    </summary>
    <p className="mt-2 text-xs text-slate-600">{SITE_VISIT_HANDOVER_NOTICE}</p>
    <p className="mt-1 text-xs text-slate-500">
      This is a locally recorded customer acknowledgment, not identity
      verification or a certified legal e-signature.
    </p>
    {existing?.status==="signed"&&<div className="mt-2 space-y-2">
      <p className="text-xs">Signed by: <strong>{existing.signerName}</strong></p>
      <p className="text-xs text-slate-500">
        Staff-recorded at {new Date(existing.confirmedAt).toLocaleString()}
      </p>
      <img className="max-w-full rounded border border-slate-200"
        src={"data:image/png;base64,"+existing.signaturePngBase64}
        alt="Locally captured handwritten service acknowledgment"/>
      <Button size="sm" variant="outline" onClick={()=>{
        try{downloadSignature(existing.signaturePngBase64);}catch(e){
          setError(e instanceof Error?e.message:"Cannot download signature");
        }
      }}>Download signature</Button>
    </div>}
    {existing?.status==="declined"&&<div className="mt-2">
      <p className="text-xs">Customer declined to sign — {existing.reason}</p>
      <p className="text-xs text-slate-500">
        Staff-recorded at {new Date(existing.confirmedAt).toLocaleString()}
      </p>
    </div>}
    {editable&&<div className="mt-3 space-y-2">
      <p className="text-xs font-medium">Customer acknowledgment signature</p>
      <label className="block text-xs font-medium">
        Signer name (customer or authorized representative)
        <input aria-label={"Visit signer name "+visit.id} className={inputClass+" mt-1"}
          maxLength={120} value={signer} onChange={e=>setSigner(e.target.value)}
          placeholder="Name given by signer"/>
      </label>
      <canvas ref={canvas} width={W} height={H}
        aria-label="Draw customer handover signature" role="img"
        className="w-full max-w-[560px] touch-none rounded border border-slate-300"
        onPointerDown={down} onPointerMove={move} onPointerUp={release}
        onPointerCancel={release}/>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={clear}>Clear signature</Button>
        <label className="flex items-start gap-2 text-xs">
          <input aria-label={"Signature consent "+visit.id} type="checkbox"
            checked={consent} onChange={e=>setConsent(e.target.checked)}/>
          The signer has read or been told the acknowledgment and agrees to capture.
        </label>
      </div>
      <Button size="sm" variant="outline"
        disabled={!ink||!signer.trim()||!consent}
        onClick={save}>Save customer signature</Button>
      <div className="border-t border-slate-200 pt-2">
        <p className="text-xs font-medium">Alternatively: customer declined to sign</p>
        <label className="block text-xs">
          Reason for refusal
          <input aria-label={"Signature refusal reason "+visit.id}
            value={declineReason} maxLength={400}
            className={inputClass+" mt-1"} onChange={e=>setDeclineReason(e.target.value)}
            placeholder="Customer unavailable or declined"/>
        </label>
        <Button size="sm" variant="outline"
          disabled={declineReason.trim().length<3}
          onClick={()=>mutate(()=>recordServiceVisitSignatureDecline({
            visitId:visit.id,expectedVersion:visit.version,reason:declineReason,
          }),"Signature refusal recorded with reason")}>
          Record refusal
        </Button>
      </div>
    </div>}
    {error&&<p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
  </details>;
}
