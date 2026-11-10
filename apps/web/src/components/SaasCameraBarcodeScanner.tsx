"use client";
import * as React from "react";

// Camera-only, never saves a frame, QR payload, customer data, inventory or session.
type DetectedBarcode={rawValue:string};
type ScanEngine={
 detect:(source:HTMLVideoElement)=>Promise<DetectedBarcode[]>;
};
type DetectorCtor=new(options:{formats:string[]})=>ScanEngine;
const FORMAT_LIST=["qr_code","code_128","ean_13","ean_8","upc_a","upc_e","code_39"];

export function SaasCameraBarcodeScanner({
 onDetected,label="Scan barcode / QR",disabled=false
}:{onDetected:(code:string)=>void;label?:string;disabled?:boolean}){
 const [running,setRunning]=React.useState(false);
 const [error,setError]=React.useState("");
 const video=React.useRef<HTMLVideoElement>(null);
 const stream=React.useRef<MediaStream|null>(null);
 const frame=React.useRef<number|null>(null);
 const active=React.useRef(false);
 const callback=React.useRef(onDetected);
 React.useEffect(()=>{callback.current=onDetected},[onDetected]);
 const stop=React.useCallback(()=>{
  active.current=false;
  if(frame.current!==null){
   cancelAnimationFrame(frame.current);
   frame.current=null;
  }
  stream.current?.getTracks().forEach(t=>t.stop());
  stream.current=null;
  if(video.current){video.current.pause();video.current.srcObject=null;}
  setRunning(false);
 },[]);
 React.useEffect(()=>()=>{active.current=false;
  if(frame.current!==null)cancelAnimationFrame(frame.current);
  stream.current?.getTracks().forEach(t=>t.stop());},[]);
 const start=React.useCallback(async()=>{
  if(active.current||disabled)return;
  setError("");
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){
   setError("Camera scanning requires HTTPS and camera permission. Enter the code manually.");
   return;
  }
  const Detector=(window as typeof window & {BarcodeDetector?:DetectorCtor}).BarcodeDetector;
  if(!Detector){
   setError("Camera barcode detection is not supported by this browser. Enter the code manually.");
   return;
  }
  let media:MediaStream;
  try{
   media=await navigator.mediaDevices.getUserMedia({
    audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1280}}
   });
  }catch{
   setError("Camera permission denied/unavailable. Enter the barcode manually.");
   return;
  }
  if(active.current||disabled){media.getTracks().forEach(t=>t.stop());return;}
  stream.current=media;
  active.current=true;
  setRunning(true);
  const view=video.current;
  if(!view){stop();return;}
  view.srcObject=media;
  try{await view.play();}catch{
   stop();setError("Camera preview unavailable. Enter the code manually.");return;
  }
  const detector=new Detector({formats:FORMAT_LIST});
  const loop=async()=>{
   if(!active.current||!video.current)return;
   try{
    const codes=await detector.detect(video.current);
    const found=codes.map(x=>x.rawValue.trim()).find(x=>x.length>0&&x.length<=128);
    if(found){
     stop();
     callback.current(found);
     return;
    }
   }catch{
    // Video frames can be unavailable during camera focus; retry without persistence.
   }
   if(active.current)frame.current=requestAnimationFrame(()=>{void loop()});
  };
  void loop();
 },[disabled,stop]);
 React.useEffect(()=>{if(disabled)stop()},[disabled,stop]);
 return <div className="w-full space-y-2">
  <div className="flex flex-wrap items-center gap-2">
   <button type="button" disabled={disabled}
    className="min-h-[44px] touch-manipulation rounded border border-slate-400 px-4 py-2 text-sm disabled:opacity-50"
    onClick={()=>{if(running)stop();else void start()}}>
    {running?"Stop camera":label}
   </button>
   {running&&<span className="text-xs">Camera active · code read locally</span>}
  </div>
  <video ref={video} autoPlay muted playsInline
   className={running?"aspect-video w-full max-w-sm rounded bg-black":"hidden"}
   aria-label="Live camera barcode scan"/>
  {error&&<p role="status" className="text-sm text-amber-700">{error}</p>}
 </div>;
}
