"use client";
import * as React from "react";
import {
  addBoutiqueDesign, archiveBoutiqueDesign, can, decideBoutiqueDesign,
  listBoutiqueDesigns, submitBoutiqueDesignForApproval,
  type BoutiqueDesignRecord,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { inputClass, selectClass } from "../forms/FormField";

async function compressedOfflineReference(file: File): Promise<string> {
  if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 8*1024*1024) {
    throw new Error("Select a JPEG, PNG or WebP image under 8 MB");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const ratio = Math.min(1, 720/Math.max(bitmap.width,bitmap.height));
    canvas.width = Math.max(1,Math.round(bitmap.width*ratio));
    canvas.height = Math.max(1,Math.round(bitmap.height*ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image resizing is not available on this device");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    for(const quality of [0.77,0.6,0.43]){
      const data=canvas.toDataURL("image/jpeg",quality);
      if(data.length<=300000)return data;
    }
    throw new Error("Image too detailed for offline portfolio; choose a smaller crop");
  } finally {
    bitmap.close();
  }
}

/** Customer-specific local image gallery. No cloud upload or social auto-publishing. */
export function BoutiquePortfolioPanel({customerId}:{customerId:string}) {
  const [records,setRecords]=React.useState<BoutiqueDesignRecord[]>([]);
  const [expanded,setExpanded]=React.useState(false);
  const [name,setName]=React.useState("");
  const [category,setCategory]=React.useState("Blouse");
  const [notes,setNotes]=React.useState("");
  const [photo,setPhoto]=React.useState<string|null>(null);
  const [error,setError]=React.useState<string|null>(null);
  const [saving,setSaving]=React.useState(false);
  const [query,setQuery]=React.useState("");
  const permitted=can("orders.manage");
  const refresh=React.useCallback(()=>{
    if(permitted) {
      try {setRecords(listBoutiqueDesigns(customerId));}
      catch (e){setError(e instanceof Error?e.message:"Unable to load customer portfolio");}
    }
  },[customerId,permitted]);
  React.useEffect(()=>{refresh()},[refresh]);
  async function pickPhoto(event:React.ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];
    setPhoto(null);setError(null);
    if(!file)return;
    setSaving(true);
    try{setPhoto(await compressedOfflineReference(file));}
    catch(e){setError(e instanceof Error?e.message:"Unable to read image");}
    finally{setSaving(false);event.target.value="";}
  }
  function add(event:React.FormEvent){
    event.preventDefault();if(!photo)return;
    try {
      addBoutiqueDesign({customerId,name,category,tags:[category],notes,referenceUrl:photo});
      setName("");setNotes("");setPhoto(null);setError(null);refresh();
    }catch(e){setError(e instanceof Error?e.message:"Unable to save design");}
  }
  function action(fn:()=>unknown){
    try{fn();setError(null);refresh();}
    catch(e){setError(e instanceof Error?e.message:"Unable to change design status");}
  }
  const displayed=records.filter(r=>[r.name,r.category,r.notes,...r.tags].join(" ").toLowerCase().includes(query.toLowerCase()));
  return <section className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="text-sm font-semibold text-slate-900">Boutique customer design portfolio</h3>
        <p className="text-xs text-slate-600">{records.length} reference(s) · stored in offline backup · no cloud uploads</p></div>
      <Button size="sm" variant="outline" onClick={()=>setExpanded(v=>!v)}>{expanded?"Hide designs":"View designs"}</Button>
    </div>
    {expanded && <>
      {permitted && <form onSubmit={add} className="mt-3 grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
        <label className="text-xs font-medium">Design name *
          <input className={inputClass+" mt-1"} value={name} onChange={e=>setName(e.target.value)} maxLength={120} required placeholder="Wedding blouse sample"/>
        </label>
        <label className="text-xs font-medium">Category
          <select className={selectClass+" mt-1"} value={category} onChange={e=>setCategory(e.target.value)}>
            {["Blouse","Wedding","Salwar","Kurti","Shirt","Suit","Uniform","Other"].map(c=><option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium">Photo (JPEG, PNG, WebP)
          <input type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full text-xs" onChange={e=>void pickPhoto(e)}/>
        </label>
        <label className="text-xs font-medium">Design notes
          <input className={inputClass+" mt-1"} value={notes} maxLength={2000} onChange={e=>setNotes(e.target.value)} placeholder="Sleeves, fabric, embellishment..."/>
        </label>
        {photo && <img className="h-24 w-24 rounded-lg object-cover" src={photo} alt="Design preview"/>}
        <div className="sm:col-span-2"><Button type="submit" size="sm" disabled={saving||!photo||!name.trim()}>{saving?"Processing image":"Save customer design"}</Button></div>
      </form>}
      <input className={inputClass+" mt-3"} type="search" placeholder="Search customer design references" aria-label="Search customer designs"
        value={query} onChange={e=>setQuery(e.target.value)}/>
      {error&&<p className="mt-2 text-xs text-rose-700" role="alert">{error}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {displayed.map(r=><article key={r.id} className="rounded-lg border border-slate-200 p-2">
          <img src={r.referenceUrl||""} alt={r.name} className="h-36 w-full rounded-md bg-slate-100 object-cover" loading="lazy"/>
          <div className="mt-2 text-sm font-semibold">{r.name}</div>
          <div className="text-xs text-slate-500">{r.category||"Design"} · {r.status.replaceAll("_"," ")} · v{r.version}</div>
          {r.notes&&<p className="mt-1 text-xs text-slate-600">{r.notes}</p>}
          {permitted&&<div className="mt-2 flex flex-wrap gap-1">
            {["draft","rejected"].includes(r.status)&&<Button size="sm" variant="outline" onClick={()=>action(()=>submitBoutiqueDesignForApproval(r.id))}>Request approval</Button>}
            {r.status==="pending_approval"&&<>
              <Button size="sm" variant="outline" onClick={()=>action(()=>decideBoutiqueDesign(r.id,true))}>Record approval</Button>
              <Button size="sm" variant="outline" onClick={()=>action(()=>decideBoutiqueDesign(r.id,false))}>Reject</Button>
            </>}
            <Button size="sm" variant="outline" onClick={()=>action(()=>archiveBoutiqueDesign(r.id))}>Archive</Button>
          </div>}
        </article>)}
        {displayed.length===0&&<p className="text-xs text-slate-500">No design photos for this customer.</p>}
      </div>
      <p className="mt-2 text-xs text-slate-500">Approval is recorded manually by staff. Designs are private customer references; this does not post to social media.</p>
    </>}
  </section>;
}
