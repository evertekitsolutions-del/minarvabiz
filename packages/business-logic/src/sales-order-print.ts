/** Print-safe A4 / thermal sales-order document; no host I/O or side effects. */
import type { SalesOrderIntent, SalesOrderAuthorizedScope } from "./sales-order-intent";
import { verifySalesOrderRecordIntegrity } from "./sales-order-record-integrity";
export interface SalesOrderPrintDetails {
 readonly businessName: string; readonly customerName: string;
 readonly businessAddress?: string | null; readonly customerAddress?: string | null;
 readonly paper?: "a4" | "thermal"; readonly locale?: string;
}
const escapeHtml = (v: string): string => v.replace(/&/g,"&amp;").replace(/</g,"&lt;")
 .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const address = (v?: string | null): string => v ? escapeHtml(v).replace(/\r\n|\r|\n/g,"<br>") : "";
function label(value: unknown, field: string): string {
 if (typeof value !== "string" || !value.trim() || value.length > 200)
   throw new Error("Invalid sales-order "+field);
 return escapeHtml(value.trim());
}
function currency(value: number, code: string, locale: string): string {
 if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid sales-order minor amount");
 const places=new Intl.NumberFormat(locale,{style:"currency",currency:code})
   .resolvedOptions().maximumFractionDigits ?? 2;
 return escapeHtml(new Intl.NumberFormat(locale,{style:"currency",currency:code,
   minimumFractionDigits:places,maximumFractionDigits:places}).format(value/10**places));
}
export function renderSalesOrderPrintHtml(
 order: SalesOrderIntent, auth: SalesOrderAuthorizedScope,
 details: SalesOrderPrintDetails, enabled=false,
): string {
 if(enabled!==true) throw new Error("SAL-003 print feature is disabled");
 if(!auth?.canManageSalesOrders) throw new Error("Sales-order print permission denied");
 verifySalesOrderRecordIntegrity(order);
 for(const field of ["organizationId","companyId","branchId","warehouseId"] as const)
   if(order[field]!==auth[field]) throw new Error("Cross-scope sales-order printing denied");
 if(!details || (details.paper!=null && !["a4","thermal"].includes(details.paper)))
   throw new Error("Invalid sales-order print paper");
 const name=label(details.businessName,"business name");
 const customer=label(details.customerName,"customer name");
 const locale=details.locale??"en-IN";
 const printMoney=(n:number)=>currency(n,order.currency,locale);
 const rows=order.lines.map((line,i)=>`<tr><td>${i+1}. ${escapeHtml(line.description)}</td>
 <td class="number">${escapeHtml(new Intl.NumberFormat(locale,{maximumFractionDigits:3}).format(line.quantityMilli/1000))}</td>
 <td class="number">${printMoney(line.unitPriceMinor)}</td>
 <td class="number">${printMoney(line.discountMinor)}</td>
 <td class="number">${printMoney(line.taxMinor)}</td>
 <td class="number">${printMoney(line.totalMinor)}</td></tr>`).join("");
 const css=details.paper==="thermal"?
   "@page{size:80mm auto;margin:3mm}body{width:72mm;margin:0 auto;font:10px Arial}td,th{padding:2px}":
   "@page{size:A4;margin:12mm}body{max-width:190mm;margin:auto;font:12px Arial}td,th{padding:6px}";
 const due=order.dueDate?escapeHtml(order.dueDate):"Not set";
 const status=escapeHtml(order.status.toUpperCase());
 return `<!doctype html><html lang="en"><head><meta charset="utf-8">
 <title>Sales Order ${escapeHtml(order.orderNumber)}</title><style>${css}
 body{color:#111;background:#fff}h1{font-size:1.4em}h2{font-size:1.15em}
 table{border-collapse:collapse;width:100%;margin:12px 0}th{text-align:left;border-bottom:1px solid #333}
 td{border-bottom:1px solid #ddd}.number{text-align:right;white-space:nowrap}
 header{border-bottom:2px solid #333;padding-bottom:8px}
 footer{border-top:1px solid #333;padding-top:8px}
 </style></head><body><header><h1>${name}</h1><div>${address(details.businessAddress)}</div>
 <h2>SALES ORDER — NOT A TAX INVOICE</h2><div>${escapeHtml(order.orderNumber)} · ${status} · v${order.version}</div>
 <div>Created ${escapeHtml(order.createdAt.slice(0,10))} · Due ${due}</div></header>
 <section><strong>Customer: ${customer}</strong><div>${address(details.customerAddress)}</div></section>
 <table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Discount</th><th>Tax</th><th>Amount</th></tr></thead>
 <tbody>${rows}</tbody></table><section style="text-align:right">
 <div>Subtotal: ${printMoney(order.subtotalMinor)}</div>
 <div>Discount: ${printMoney(order.discountMinor)}</div>
 <div>Tax: ${printMoney(order.taxMinor)}</div>
 <h2>Total: ${printMoney(order.totalMinor)}</h2></section>
 <footer>${order.invoiceId?`Linked invoice: ${escapeHtml(order.invoiceId)}`:""}
 <div>Notes: ${address(order.note)||"None"}</div>
 <small>This sales order is not an invoice or payment receipt.</small></footer>
 </body></html>`;
}
