/** Barcode label text layout for thermal / sticker printers */
import type { Product } from "@minarvabiz/types";
import { formatMoney } from "@minarvabiz/utils";
import { getShopProfile } from "./shop-profile";

export function buildProductLabelText(product: Product): string {
  const shop = getShopProfile().shopName;
  return [
    shop,
    product.name,
    product.sku ? `SKU: ${product.sku}` : "",
    product.barcode ? `*${product.barcode}*` : "",
    formatMoney(product.sellingPrice),
  ]
    .filter(Boolean)
    .join("\n");
}

export function printProductLabels(products: Product[]): void {
  if (typeof window === "undefined") return;
  const body = products
    .map(
      (p) =>
        `<div class="label"><pre>${buildProductLabelText(p)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")}</pre></div>`
    )
    .join("");
  const html = `<!DOCTYPE html><html><head><title>Labels</title>
<style>
  body { font-family: monospace; }
  .label { width: 50mm; height: 30mm; border: 1px dashed #ccc; padding: 4px; margin: 4px; display: inline-block; page-break-inside: avoid; }
  pre { margin: 0; font-size: 11px; white-space: pre-wrap; }
  @media print { .label { border: none; } }
</style></head><body>${body}<script>window.onload=function(){window.print();}</script></body></html>`;
  const w = window.open("", "_blank", "width=600,height=400");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
