/**
 * Barcode generation + label HTML for normal/thermal label printers.
 * Generated codes use an internal EAN-13 compatible prefix (290) and are
 * intended for in-shop scanning; they are not a GS1 retail allocation.
 */
import type { Product } from "@minarvabiz/types";
import { getShopProfile } from "./shop-profile";
import { formatMoney } from "@minarvabiz/utils";

const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
const PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];

export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) throw new Error("EAN-13 base must contain 12 digits");
  const sum = first12.split("").reduce((acc, digit, index) => acc + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

export function generateProductBarcode(existing: Array<string | null | undefined> = []): string {
  const used = new Set(existing.filter((value): value is string => Boolean(value)));
  const seed = Date.now() % 1_000_000_000;
  for (let offset = 0; offset < 10000; offset += 1) {
    const body = `290${String((seed + offset) % 1_000_000_000).padStart(9, "0")}`;
    const code = body + ean13CheckDigit(body);
    if (!used.has(code)) return code;
  }
  throw new Error("Unable to generate a unique barcode");
}

function ean13Bits(code: string): string {
  if (!isValidEan13(code)) throw new Error("Barcode must be a valid EAN-13 code");
  const digits = code.split("").map(Number);
  const parity = PARITY[digits[0]];
  let bits = "101";
  for (let i = 1; i <= 6; i += 1) bits += parity[i - 1] === "L" ? L[digits[i]] : G[digits[i]];
  bits += "01010";
  for (let i = 7; i <= 12; i += 1) bits += R[digits[i]];
  return bits + "101";
}

function barcodeSvg(code: string): string {
  if (!isValidEan13(code)) return `<div class="code">${escape(code)}</div>`;
  const bits = ean13Bits(code);
  const quiet = 9;
  const total = bits.length + quiet * 2;
  const bars = [...bits].map((bit, index) => bit === "1"
    ? `<rect x="${index + quiet}" y="0" width="1" height="34"/>`
    : "").join("");
  return `<svg class="barcode-svg" viewBox="0 0 ${total} 44" role="img" aria-label="EAN-13 ${escape(code)}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${total}" height="44" fill="white"/>
    <g fill="black">${bars}</g>
    <text x="${total / 2}" y="42" text-anchor="middle" font-size="7" font-family="Arial, sans-serif" letter-spacing="1">${escape(code)}</text>
  </svg>`;
}

export function buildBarcodeLabelHtml(
  product: Product,
  opts?: { copies?: number; categoryName?: string | null }
): string {
  const shop = getShopProfile();
  const copies = Math.max(1, Math.min(100, opts?.copies ?? 1));
  const categoryName = opts?.categoryName ?? null;
  const blocks = Array.from({ length: copies })
    .map(() => `
  <div class="label">
    <div class="shop">${escape(shop.shopName || "Minarva Biz")}</div>
    <div class="name">${escape(product.name)}</div>
    <div class="meta">${escape([categoryName, product.size, product.color, product.brand].filter(Boolean).join(" · "))}</div>
    <div class="sku">${product.sku ? "SKU: " + escape(product.sku) : ""}</div>
    <div class="barcode">${product.barcode ? barcodeSvg(product.barcode) : '<span class="missing">No barcode</span>'}</div>
    <div class="price">${formatMoney(product.sellingPrice)}</div>
  </div>`)
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Product Labels</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,Arial,sans-serif;margin:0;color:#111}
  .label{width:50mm;min-height:30mm;padding:2.5mm;text-align:center;border:1px dashed #ccc;page-break-after:always;overflow:hidden}
  .shop{font-size:9px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .name{font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .meta,.sku{font-size:8px;min-height:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .barcode{margin:1mm 0}.barcode-svg{display:block;width:44mm;height:15mm;margin:0 auto}
  .missing{font-size:10px;color:#b91c1c}.price{font-size:12px;font-weight:800}
  @media print{.label{border:none}}
</style></head><body>${blocks}
<script>window.onload=function(){window.print()}</script></body></html>`;
}

export function printBarcodeLabels(product: Product, copies = 1, categoryName?: string | null) {
  if (typeof window === "undefined") return;
  const w = window.open("", "_blank", "width=500,height=700");
  if (!w) return;
  w.document.write(buildBarcodeLabelHtml(product, { copies, categoryName }));
  w.document.close();
}

function escape(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function printProductLabels(products: Product[], copies = 1) {
  for (const p of products) printBarcodeLabels(p, copies);
}
