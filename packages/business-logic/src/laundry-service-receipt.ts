/** Branded A4 non-tax laundry service ticket / payment acknowledgment. */
import type { Customer, LaundryOrder } from "@minarvabiz/types";
import { calculateLaundryProfit } from "./laundry";
import { escapeHtml } from "./html";
import { getShopProfile, type ShopProfile } from "./shop-profile";
import { requestDesktopPrintHtml } from "./desktop-print";

export interface LaundryReceiptOptions {
  customer?: Pick<Customer, "id" | "name" | "phone" | "address"> | null;
  shop?: ShopProfile;
}
function money(value: number, currency: string): string {
  if (!Number.isFinite(value)) throw new Error("Invalid laundry ticket amount");
  return escapeHtml(currency) + " " + value.toFixed(2);
}
function printDate(date?: string | null): string {
  return escapeHtml(date?.slice(0, 10) || "Not specified");
}
export function buildLaundryServiceReceiptHtml(order: LaundryOrder, opts: LaundryReceiptOptions = {}): string {
  if (!order?.id || !order.orderNumber || !order.customerId || !Number.isFinite(order.totalCustomerCharge)
    || !Number.isFinite(order.customerRate) || !Number.isFinite(order.paidAmount)
    || !Number.isFinite(order.balanceAmount) || order.totalCustomerCharge < 0
    || order.customerRate < 0 || order.paidAmount < 0 || order.balanceAmount < 0) {
    throw new Error("A valid posted laundry ticket is required");
  }
  const shop = opts.shop || getShopProfile();
  const currency = shop.currency || "INR";
  const customer = opts.customer?.id === order.customerId ? opts.customer : null;
  const name = customer?.name || order.customerName || order.customerId;
  const lines = order.items?.length ? order.items.map(item => ({
    label: item.label, tag: item.tagCode, service: item.serviceCode || "",
    fabric: item.fabricType || "", quantity: item.quantity,
  })) : [{label: order.garment || "Laundry service", tag: "", service: "", fabric: "", quantity: order.quantity}];
  if (!lines.length || lines.some(item => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
    throw new Error("Invalid laundry garment quantity");
  }
  const rows = lines.map((item,index) => {
    const extended = calculateLaundryProfit({customerRate:order.customerRate,supplierRate:0,quantity:item.quantity}).totalCustomerCharge;
    const detail = [item.service.replaceAll("_", " "),item.fabric.replaceAll("_", " ")].filter(Boolean).join(" / ");
    return "<tr><td>" + (index+1) + "</td><td><b>" + escapeHtml(item.label) + "</b>"
      + (detail ? '<div class="small">' + escapeHtml(detail) + "</div>" : "")
      + (item.tag ? '<div class="small">Tag ' + escapeHtml(item.tag) + "</div>" : "")
      + '</td><td class="right">' + escapeHtml(item.quantity) + '</td><td class="right">' + money(order.customerRate,currency)
      + '</td><td class="right">' + money(extended,currency) + "</td></tr>";
  }).join("");
  const address = [shop.address,shop.addressLine2,shop.district,shop.state,shop.postalCode,shop.country]
    .filter(value=>typeof value==="string" && value.trim()).map(escapeHtml).join(", ");
  const contacts = [shop.phone,shop.email,shop.website].filter(Boolean).map(escapeHtml).join(" · ");
  const cancelled = order.status === "cancelled";
  const style = "@page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;font:12px Arial,sans-serif;color:#1c2936}"
    + "header{display:flex;justify-content:space-between;gap:25px;border-bottom:2px solid #1c2936;padding-bottom:12px}"
    + "h1{font-size:22px;margin:0 0 5px}h2{font-size:13px;margin:20px 0 8px}"
    + ".small{font-size:10px;color:#596674;margin-top:4px}.subtitle{font-weight:700;letter-spacing:.5px}"
    + ".grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 30px;margin:16px 0}"
    + "table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #d6dce4;padding:9px 6px;text-align:left;vertical-align:top}"
    + "th{background:#eff2f6}.right{text-align:right;white-space:nowrap}"
    + ".totals{margin-left:auto;width:44%;margin-top:16px}.totals>div{display:flex;justify-content:space-between;padding:6px;border-bottom:1px solid #e5e9f0}"
    + ".totals strong{font-size:15px}.notice{padding:10px;background:#f7f9fa;border:1px solid #cbd5e1;margin-top:20px}"
    + ".sign{display:flex;justify-content:space-between;margin-top:45px;gap:30px}.sign>div{width:45%;border-top:1px solid #8593a0;padding-top:7px}"
    + ".footer{margin-top:32px;font-size:10px;color:#596674;white-space:pre-wrap;overflow-wrap:anywhere}";
  const row = (name: string, value: string) => "<div><b>"+name+":</b> "+value+"</div>";
  const totalRow = (name: string, value: number) => "<div><span>"+name+"</span><b>"+money(value,currency)+"</b></div>";
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + "<title>Laundry service receipt - "+escapeHtml(order.orderNumber)+"</title><style>"+style+"</style></head><body>"
    + "<header><div><h1>"+escapeHtml(shop.shopName)+"</h1>"
    + (shop.legalName?"<div>"+escapeHtml(shop.legalName)+"</div>":"")
    + '<div class="small">'+address+"</div>"+'<div class="small">'+contacts+"</div>"
    + (shop.gstin?'<div class="small">GSTIN: '+escapeHtml(shop.gstin)+"</div>":"")
    + '</div><div><div class="subtitle">LAUNDRY SERVICE TICKET</div>'
    + '<div class="small">Payment acknowledgment · not a GST tax invoice</div><p><strong>'
    + escapeHtml(order.orderNumber)+"</strong></p></div></header>"
    + (cancelled?'<div class="notice"><b>CANCELLED / VOID</b> — Historical record only. Not a payment demand.</div>':"")
    + '<div class="grid">'
    + row("Customer",escapeHtml(name))+row("Booking date",printDate(order.createdAt))
    + row("Customer phone",escapeHtml(customer?.phone||"—"))
    + row("Service",order.mode==="outsourced"?"Outsourced laundry":"In-house ironing")
    + row("Pickup date",printDate(order.pickupAt))+row("Promised date",printDate(order.dueAt))
    + row("Status",escapeHtml(order.status))+row("Garments",escapeHtml(order.quantity))
    + '</div><h2>Garment / service details</h2><table><thead><tr><th>#</th><th>Garment and tag</th><th class="right">Qty</th>'
    + '<th class="right">Unit rate</th><th class="right">Line charge</th></tr></thead><tbody>'+rows+"</tbody></table>"
    + '<div class="totals">'+totalRow("Posted service charge",order.totalCustomerCharge)
    + totalRow("Payment recorded",order.paidAmount)
    + totalRow(cancelled?"Historical balance":"Balance outstanding",order.balanceAmount)+"</div>"
    + (order.notes?'<div class="notice"><b>Service notes</b><div>'+escapeHtml(order.notes)+"</div></div>":"")
    + '<div class="notice">This is a service booking/payment acknowledgment, not a statutory GST tax invoice.'
    + ' GST/tax breakdown is not represented by this ticket. Delivery follows the recorded QC workflow.</div>'
    + '<div class="sign"><div>Customer / recipient</div><div>Authorized representative</div></div>'
    + '<div class="footer">'+escapeHtml(shop.receiptFooter||"Thank you for your business.")+"</div></body></html>";
}
export async function printLaundryServiceReceipt(order: LaundryOrder, opts: LaundryReceiptOptions = {}):
Promise<{ok: boolean; error?: string}> {
  if (typeof window === "undefined") return {ok:false,error:"Printing requires an active browser/desktop"};
  const html = buildLaundryServiceReceiptHtml(order,opts);
  const native = requestDesktopPrintHtml(html,"a4");
  if (native) return native;
  const popup = window.open("","_blank","width=850,height=1050");
  if (!popup) return {ok:false,error:"Print popup blocked; allow popups and retry"};
  popup.document.open();
  popup.document.write(html.replace("</body>",'<script>window.addEventListener("load",()=>window.print());</script></body>'));
  popup.document.close();
  return {ok:true};
}
