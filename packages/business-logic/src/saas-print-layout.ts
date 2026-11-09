/** Browser/PDF-safe precise millimetre layout, no device driver or paid PDF service. */
import { escapeHtml } from "./html";
import { qrSvg } from "./qr-code";
import { barcodeSvg } from "./barcode-labels";

export interface SaaSSticker {
  name: string;
  sku: string;
  barcode: string;
  price: number;
}
export interface SaaSThermalReceipt {
  invoice: string;
  storeName: string;
  lines: readonly { name: string; qty: number; amount: number }[];
  total: number;
  paid: number;
}
const money=(n:number):string=>{
 if(!Number.isFinite(n)||n<0||n>999999999999||Math.round(n*100)!==n*100) throw new Error("Invalid receipt amount");
 return n.toFixed(2);
};
const esc=(s:string)=>escapeHtml(String(s));

/** 80mm receipt, content-flow page height; no blank fixed-height page/cutter feed. */
export function saasThermal80mmHtml(receipt:SaaSThermalReceipt):string {
 if(!receipt.invoice.trim()||!receipt.storeName.trim()||!receipt.lines.length||receipt.lines.length>200)
  throw new Error("Invalid thermal receipt");
 const lines=receipt.lines.map(row=>{
  if(!Number.isSafeInteger(row.qty)||row.qty<=0) throw new Error("Invalid line quantity");
  return `<tr><td>${esc(row.name)}</td><td class="num">${row.qty}</td><td class="num">₹${money(row.amount)}</td></tr>`;
 }).join("");
 return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(receipt.invoice)}</title>
<style>@page{size:80mm auto;margin:0}*{box-sizing:border-box}html,body{width:80mm!important;min-height:0!important;height:auto!important;margin:0;padding:0;color:#000;background:white;font:11px Arial,sans-serif}main{width:76mm;margin:0;padding:2mm 1mm;page-break-after:auto;break-after:auto}h1{font-size:13px;text-align:center;margin:0 0 2mm}p{margin:1mm 0}table{width:100%;border-collapse:collapse;table-layout:fixed}td{padding:1mm 0;overflow-wrap:anywhere;vertical-align:top}td.num{text-align:right;white-space:nowrap;width:15mm}.totals{border-top:1px dashed #000;margin-top:2mm;padding-top:2mm}footer{margin-top:2mm;text-align:center;font-size:9px}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}main{page-break-after:auto!important;break-after:auto!important}}</style>
</head><body><main><h1>${esc(receipt.storeName)}</h1><p>Invoice: ${esc(receipt.invoice)}</p><table><tbody>${lines}</tbody></table>
<div class="totals">Total ₹${money(receipt.total)} · Paid ₹${money(receipt.paid)}</div><footer>Thank you</footer></main></body></html>`;
}
/** 2-up 38x25mm labels on 80mm roll: deterministic rows, NO cumulative CSS flow drift.
 * Browser print calibration must disable printer scaling/header/footer and configure media 80mm wide.
 */
export function saas2Up38x25mmHtml(labels:readonly SaaSSticker[]):string {
 if(!labels.length||labels.length>200)throw new Error("Expected 1–200 labels");
 const rows=[] as string[];
 for(let i=0;i<labels.length;i+=2){
  const cells=labels.slice(i,i+2).map((label,j)=>{
   if(!label.barcode.trim()||label.barcode.length>64)throw new Error("Invalid barcode");
   const qr=qrSvg(label.barcode);
   const bar=barcodeSvg(label.barcode);
   return `<article class="sticker" style="left:${j===0?0:40}mm"><div class="name">${esc(label.name)}</div><div class="codes"><div class="bar">${bar}</div><div class="qr">${qr}</div></div><div class="sku">${esc(label.sku)}</div><div class="price">Price ₹${money(label.price)}</div></article>`;
  }).join("");
  rows.push(`<section class="row">${cells}</section>`);
 }
 return `<!doctype html><html><head><meta charset="utf-8"><title>38 × 25 mm labels</title><style>
@page{size:80mm ${Math.ceil(labels.length/2)*25}mm;margin:0}
*{box-sizing:border-box}html,body{width:80mm;min-width:80mm;height:auto;margin:0!important;padding:0!important;background:#fff;color:#000}
.row{display:block;position:relative;height:25mm;width:80mm;margin:0;padding:0;break-inside:avoid;page-break-inside:avoid;overflow:hidden}
.sticker{position:absolute;top:0;width:38mm;height:25mm;padding:1mm;overflow:hidden;font:8px Arial,sans-serif}
.name{height:3mm;white-space:nowrap;overflow:hidden;font-size:8px;font-weight:700}
.codes{display:flex;height:13mm;gap:.5mm;align-items:center;overflow:hidden}.bar{width:27mm;max-height:13mm}.bar svg{width:100%;height:13mm;display:block}.qr{width:8mm;height:8mm;flex:none}.qr svg{width:100%;height:100%;display:block}
.sku{height:2.5mm;font-size:6px;overflow:hidden}.price{height:3.5mm;font-size:10px;font-weight:700;text-align:center;white-space:nowrap}
@media print{html,body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.row{page-break-after:avoid;break-after:avoid}}
</style></head><body>${rows.join("")}</body></html>`;
}
