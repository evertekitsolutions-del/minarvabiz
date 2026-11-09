"use client";

import * as React from "react";
import { buildSaasTwoUp38x25Labels, getRuntimeMode } from "@minarvabiz/business-logic";
import type { Product } from "@minarvabiz/types";

export function SaasLabelPrintPanel({products}:{products:Product[]}){
 const [productId,setProductId]=React.useState("");
 const [copies,setCopies]=React.useState("2");
 const [error,setError]=React.useState("");
 const [notice,setNotice]=React.useState("");
 if(getRuntimeMode()==="demo")return null;
 const printable=products.filter(p=>!p.hasVariants&&p.isActive);
 const selected=printable.find(p=>p.id===productId)||printable[0];
 function show(){
  setNotice("");setError("");
  if(!selected) {setError("No saleable cloud product selected.");return}
  const count=Number(copies);
  if(!Number.isSafeInteger(count)||count<1||count>20){setError("Enter 1–20 copies.");return}
  try{
   const html=buildSaasTwoUp38x25Labels([selected],count);
   const windowRef=window.open("","_blank","width=500,height=730");
   if(!windowRef){setError("Browser blocked the label print/PDF window.");return}
   windowRef.document.open();windowRef.document.write(html);windowRef.document.close();
   windowRef.addEventListener("load",()=>{windowRef.focus();windowRef.print()},{once:true});
   setNotice("38×25 mm two-up preview opened. Print at 100% scale, no margins, or select Save as PDF.");
  }catch(e){setError(e instanceof Error?e.message:"Unable to build label sheet.");}
 }
 return <section className="rounded-xl border bg-white p-3">
   <h3 className="font-semibold">SaaS barcode / QR label printing</h3>
   <p className="mb-2 text-xs text-slate-600">38 × 25 mm · 2-up · Price · no blank spacer rows. Printer driver: 76 mm roll width, 25 mm row pitch, scale 100%, margins none.</p>
   <div className="grid gap-2 sm:grid-cols-3">
     <label className="text-sm">Product
      <select className="mt-1 w-full rounded border p-2" value={selected?.id||""} onChange={e=>setProductId(e.target.value)}>
       {printable.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
     </label>
     <label className="text-sm">Labels
      <input className="mt-1 w-full rounded border p-2" type="number" min="1" max="20" step="1" value={copies} onChange={e=>setCopies(e.target.value)}/>
     </label>
     <button className="self-end rounded bg-slate-900 p-2 text-white" type="button" onClick={show}>
       Print / Save PDF
     </button>
   </div>
   {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
   {notice&&<p role="status" className="text-sm text-green-700">{notice}</p>}
 </section>;
}
