/** Print-ready A4 tailor production job card, reusing posted service order details. */
import type { MeasurementProfile, ServiceOrder, StaffAssignment } from "@minarvabiz/types";
import { escapeHtml } from "./html";
import { tryDesktopPrintHtml } from "./desktop-print";
import { getShopProfile } from "./shop-profile";
import { SERVICE_TYPE_LABELS, ORDER_STATUS_LABELS } from "./orders";

export interface TailorJobCardOptions {
  measurements?: MeasurementProfile | null;
  assignments?: readonly StaffAssignment[];
  shopName?: string;
}

function label(field: string): string {
  return field.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ")
    .replace(/\b[a-z]/g, character => character.toUpperCase());
}

export function buildTailorJobCardHtml(order: ServiceOrder, opts: TailorJobCardOptions = {}): string {
  if (!order?.id || !order.orderNumber || !order.customerId) {
    throw new Error("A valid posted service order is required for a production job card");
  }
  const shop = escapeHtml(opts.shopName || getShopProfile().shopName);
  const profile = opts.measurements?.customerId === order.customerId
    && opts.measurements?.id === order.measurementProfileId ? opts.measurements : null;
  // Never replace measurements posted on the order with a later profile revision.
  const measurements = order.measurements && Object.keys(order.measurements).length
    ? order.measurements : profile?.fields || {};
  const assignmentRows = (opts.assignments || []).filter(row =>
    row.orderId === order.id && row.status !== "cancelled")
    .map(row => "<tr><td>" + escapeHtml(row.staffName || row.staffId) + "</td><td>" +
      escapeHtml(row.status.replaceAll("_", " ")) + "</td><td>" +
      escapeHtml(row.notes || "—") + "</td></tr>").join("");
  const measurementRows = Object.entries(measurements)
    .filter(([,value]) => value !== "" && value != null)
    .map(([field,value]) => "<tr><td>" + escapeHtml(label(field)) + "</td><td>" +
      escapeHtml(String(value)) + "</td></tr>").join("");
  const productionSteps = ["Received", "Cutting", "Stitching", "Alteration / embroidery", "Quality check", "Packing / ready"];
  const checklist = productionSteps.map(step => "<div class=\"step\"><span class=\"square\"></span>" + escapeHtml(step) + "</div>").join("");
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Tailor job card — ' + escapeHtml(order.orderNumber) + '</title>' +
    '<style>@page{size:A4;margin:13mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#172334;margin:0}' +
    'h1{font-size:20px;margin:0 0 4px}h2{font-size:13px;border-bottom:1px solid #ccd2da;margin:19px 0 8px;padding-bottom:4px}' +
    '.small{font-size:10px;color:#526171}.top{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #172334;padding-bottom:12px}' +
    '.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 24px;margin-top:12px}' +
    'table{width:100%;border-collapse:collapse}td,th{border:1px solid #d9dee7;padding:6px;text-align:left;vertical-align:top}' +
    'th{background:#f4f6f8}.check{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.step{padding:8px;border:1px solid #d9dee7}' +
    '.square{display:inline-block;width:12px;height:12px;border:1px solid #526171;margin-right:7px;vertical-align:middle}' +
    '.note{white-space:pre-wrap;border:1px solid #d9dee7;padding:9px;min-height:37px;overflow-wrap:anywhere}' +
    '.sign{display:flex;justify-content:space-between;gap:24px;margin-top:38px}.sign div{width:45%;border-top:1px solid #526171;padding-top:6px}' +
    '</style></head><body><header class="top"><div><h1>' + shop + '</h1><div class="small">TAILOR / PRODUCTION JOB CARD · INTERNAL WORK COPY</div></div>' +
    '<div><strong>' + escapeHtml(order.orderNumber) + '</strong><br><span class="small">' + escapeHtml(order.status) + '</span></div></header>' +
    '<div class="grid"><div><b>Customer:</b> ' + escapeHtml(order.customerName || order.customerId) + '</div>' +
    '<div><b>Service:</b> ' + escapeHtml(SERVICE_TYPE_LABELS[order.serviceType] || order.serviceType) + '</div>' +
    '<div><b>Order date:</b> ' + escapeHtml(order.orderDate) + '</div>' +
    '<div><b>Promised delivery:</b> ' + escapeHtml(order.deliveryDate || "Not specified") + '</div>' +
    '<div><b>Quantity:</b> ' + escapeHtml(String(order.quantity)) + '</div>' +
    '<div><b>Production stage:</b> ' + escapeHtml(ORDER_STATUS_LABELS[order.status] || order.status) + '</div>' +
    '<div><b>Customer material:</b> ' + (order.customerSuppliedMaterial ? "Yes" : "No") + '</div>' +
    '<div><b>Shop material:</b> ' + (order.shopSuppliedMaterial ? "Yes" : "No") + '</div></div>' +
    '<h2>Garment measurements</h2>' + (measurementRows ?
      '<table><thead><tr><th>Measurement</th><th>Value</th></tr></thead><tbody>' + measurementRows + '</tbody></table>' :
      '<p class="small">No measurements recorded on this job card.</p>') +
    '<h2>Tailor / production team</h2>' + (assignmentRows ?
      '<table><thead><tr><th>Assigned worker</th><th>Status</th><th>Instructions</th></tr></thead><tbody>' + assignmentRows + '</tbody></table>' :
      '<p class="small">No staff assignment attached.</p>') +
    '<h2>Fabric, material and accessories</h2><div class="note">' + escapeHtml(order.materialDetails || "—") + '</div>' +
    '<h2>Customer instructions / alterations</h2><div class="note">' + escapeHtml(order.notes || "—") + '</div>' +
    '<h2>Production checklist</h2><div class="check">' + checklist + '</div>' +
    '<div class="sign"><div>Tailor / quality checker</div><div>Final handover / date</div></div></body></html>';
}

export function printTailorJobCard(order: ServiceOrder, opts: TailorJobCardOptions = {}): boolean {
  if (typeof window === "undefined") return false;
  const html = buildTailorJobCardHtml(order, opts);
  if (tryDesktopPrintHtml(html, "a4")) return true;
  const popup = window.open("", "_blank", "width=850,height=1050");
  if (!popup) return false;
  popup.document.open();
  popup.document.write(html.replace("</body>", "<script>window.onload=function(){window.print()}</script></body>"));
  popup.document.close();
  return true;
}
