/**
 * Barcode label HTML for thermal label printers (browser print)
 */
import type { Product } from "@minarvabiz/types";
import { getShopProfile } from "./shop-profile";
import { formatMoney } from "@minarvabiz/utils";

export function buildBarcodeLabelHtml(product: Product, opts?: { copies?: number }): string {
  const shop = getShopProfile();
  const copies = Math.max(1, opts?.copies ?? 1);
  const blocks = Array.from({ length: copies })
    .map(
      () => `
  <div class="label">
    <div class="shop">${escape(shop.shopName || "Minarva Biz")}</div>
    <div class="name">${escape(product.name)}</div>
    <div class="meta">${escape([product.size, product.color, product.brand].filter(Boolean).join(" · "))}</div>
    <div class="sku">SKU: ${escape(product.sku || "—")}</div>
    <div class="barcode">${product.barcode ? `*${escape(product.barcode)}*` : ""}</div>
    <div class="code">${escape(product.barcode || "")}</div>
    <div class="price">${formatMoney(product.sellingPrice)}</div>
  </div>`
    )
    .join("");
  return `<!DOCTYPE html><html><head><title>Labels</title>
<style>
  body{font-family:system-ui,monospace;margin:0}
  .label{width:50mm;min-height:30mm;padding:4mm;border:1px dashed #ccc;page-break-after:always}
  .shop{font-size:10px;color:#64748b}
  .name{font-size:12px;font-weight:700}
  .meta,.sku{font-size:10px}
  .barcode{font-family:monospace;font-size:16px;letter-spacing:2px;margin:4px 0}
  .price{font-size:14px;font-weight:700}
  @media print{.label{border:none}}
</style></head><body>${blocks}
<script>window.onload=function(){window.print()}</script></body></html>`;
}

export function printBarcodeLabels(product: Product, copies = 1) {
  if (typeof window === "undefined") return;
  const w = window.open("", "_blank", "width=400,height=600");
  if (!w) return;
  w.document.write(buildBarcodeLabelHtml(product, { copies }));
  w.document.close();
}

function escape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function printProductLabels(products: Product[], copies = 1) {
  for (const p of products) printBarcodeLabels(p, copies);
}
