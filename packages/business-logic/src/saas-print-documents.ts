/** Browser-only printable documents, no Electron, printer bridge or offline state. */
import type { Product } from "@minarvabiz/types";
import { escapeHtml } from "./html";
import { qrSvg } from "./qr-code";
import { barcodeSvg } from "./barcode-labels";

export type SaasLabelProduct = Pick<Product,
 "id"|"name"|"sku"|"barcode"|"brand"|"fabric"|"color"|"size"|"sellingPrice">;

export function buildSaasTwoUp38x25Labels(
 products: readonly SaasLabelProduct[],copies=1,shopName="Minarva Biz",
): string {
 if(!Array.isArray(products)||products.length<1||products.length>150
  ||!Number.isSafeInteger(copies)||copies<1||copies>20||products.length*copies>300)
  throw new Error("1–300 labels, 1–20 copies per product.");
 const labels=products.flatMap(p=>Array.from({length:copies},()=>{
  const code=p.barcode||p.sku||p.id;
  if(!code||code.length>96)throw new Error("Barcode missing or too long.");
  if(!Number.isFinite(p.sellingPrice)||p.sellingPrice<0)
   throw new Error("Cannot print an invalid cloud product Price.");
  let qr="";
  try{qr=qrSvg(code,"QR code");}catch{qr='<span class="qr-unavailable">QR unavailable</span>';}
  const variant=[p.brand,p.fabric,p.color,p.size].filter(Boolean).join(" · ");
  return `<article class="label"><div class="shop">${escapeHtml(shopName)}</div>
   <div class="name">${escapeHtml(p.name)}</div>
   <div class="variant">${escapeHtml(variant)}</div>
   <div class="machine"><div class="barcode">${barcodeSvg(code)}</div>
   <div class="qr">${qr}</div></div>
   <div class="price">Price ₹${p.sellingPrice.toFixed(2)}</div></article>`;
 }));
 const sheets=Array.from({length:Math.ceil(labels.length/2)},(_,i)=>
  `<div class="sheet">${labels.slice(i*2,i*2+2).join("")}</div>`).join("");
 return `<!doctype html><html><head><meta charset="utf-8"><title>38 × 25 mm · 2-up barcode/QR labels</title>
 <style>
 @page{size:76mm 25mm;margin:0}
 *,*::before,*::after{box-sizing:border-box}
 html,body{width:76mm;margin:0!important;padding:0!important;min-height:0;height:auto;font:7pt Arial,sans-serif;color:#000;background:#fff}
 .sheet{width:76mm;height:24.70mm;max-height:24.70mm;display:grid;
 grid-template-columns:38mm 38mm;column-gap:0;break-inside:avoid;page-break-inside:avoid;overflow:hidden}
 .label{width:38mm;height:24.65mm;max-height:24.65mm;padding:.55mm .75mm .75mm;
 display:flex;flex-direction:column;align-items:stretch;overflow:hidden;gap:.18mm}
 .shop{font-size:5.6pt;line-height:1;overflow:hidden;white-space:nowrap;text-align:center}
 .name{font-size:7.6pt;line-height:1;font-weight:700;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .variant{font-size:5.2pt;line-height:1;text-align:center;white-space:nowrap;overflow:hidden;height:1.9mm}
 .machine{height:9.4mm;display:flex;align-items:center;gap:.45mm;overflow:hidden}
 .barcode{width:70%;height:9mm}.barcode-svg{display:block;width:100%;height:100%}
 .qr{width:30%;height:8mm;display:flex;align-items:center;justify-content:center}
 .qr-svg{width:7.7mm;height:7.7mm}
 .qr-unavailable{font-size:4pt}
 .price{font-size:8.1pt;line-height:1;font-weight:800;text-align:center;white-space:nowrap}
 @media print{.sheet{break-after:page;page-break-after:always}
 .sheet:last-child{break-after:auto;page-break-after:auto}}
 </style></head><body>${sheets}</body></html>`;
}

export function buildSaasThermal80mmReceipt(input:{
 invoice:string;business:string;printedAt:string;
 lines:readonly {name:string;quantity:number;unitPrice:number;total:number}[];
 total:number;paid:number;balance:number;gst:number;
}):string {
 if(!input.lines.length||input.lines.length>200||
  ![input.total,input.paid,input.balance,input.gst].every(n=>Number.isFinite(n)&&n>=0))
  throw new Error("Invalid thermal cloud receipt.");
 const rows=input.lines.map(l=>{
  if(!Number.isFinite(l.quantity)||l.quantity<=0||!Number.isFinite(l.unitPrice)||l.unitPrice<0||
    !Number.isFinite(l.total)||l.total<0)throw new Error("Invalid receipt item.");
  return `<tr><td>${escapeHtml(l.name)} × ${l.quantity}</td><td class="num">₹${l.total.toFixed(2)}</td></tr>`;
 }).join("");
 return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${escapeHtml(input.invoice)}</title>
 <style>@page{margin:0}
 html,body{width:72mm!important;min-height:0!important;height:auto!important;
 margin:0!important;padding:0!important;color:black;background:white;
 font:10pt monospace}
 main{width:72mm;min-height:0;height:auto;padding:2mm;break-inside:avoid}
 h1{font-size:13pt;text-align:center;margin:0}
 .small{text-align:center;font-size:8pt}
 hr{border:0;border-top:1px dashed #000;margin:2mm 0}
 table{width:100%;border-collapse:collapse;table-layout:fixed}
 td{padding:.75mm 0;vertical-align:top;overflow-wrap:anywhere}
 td.num{text-align:right;width:25mm;white-space:nowrap}
 strong{font-size:11pt}
 @media print{main{break-after:auto;page-break-after:auto}}</style></head>
 <body><main><h1>${escapeHtml(input.business)}</h1>
 <div class="small">Invoice: ${escapeHtml(input.invoice)}</div>
 <div class="small">${escapeHtml(input.printedAt)}</div><hr>
 <table><tbody>${rows}</tbody></table><hr>
 <table><tbody>
 <tr><td>GST included</td><td class="num">₹${input.gst.toFixed(2)}</td></tr>
 <tr><td><strong>TOTAL</strong></td><td class="num"><strong>₹${input.total.toFixed(2)}</strong></td></tr>
 <tr><td>Paid</td><td class="num">₹${input.paid.toFixed(2)}</td></tr>
 <tr><td>Balance</td><td class="num">₹${input.balance.toFixed(2)}</td></tr>
 </tbody></table><hr><div class="small">Thank you</div>
 </main></body></html>`;
}
