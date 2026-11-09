/**
 * Barcode generation + label HTML for normal/thermal label printers.
 * Generated codes use an internal EAN-13 compatible prefix (290) and are
 * intended for in-shop scanning; they are not a GS1 retail allocation.
 */
import type { Product } from "@minarvabiz/types";
import { getShopProfile } from "./shop-profile";
import { formatMoney } from "@minarvabiz/utils";
import { escapeHtml } from "./html";
import { getPrintSettings } from "./print-settings";
import { requestDesktopPrintHtml, tryDesktopPrintHtml } from "./desktop-print";
import { qrSvg } from "./qr-code";

const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
const PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];

const CODE128_PATTERNS = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112",
];

function code128BSvg(raw: string): string {
  const value = String(raw || "");
  // Never silently substitute or truncate an identifier: scanners must return the stored code.
  const clean = value;
  if (/[^\x20-\x7e]/.test(clean)) return '<span class="missing">Use QR for non-ASCII product codes</span>';
  if (!clean) return '<span class="missing">No barcode</span>';

  const values = [...clean].map((char) => char.charCodeAt(0) - 32);
  let checksum = 104;
  values.forEach((item, index) => { checksum += item * (index + 1); });
  checksum %= 103;
  const symbols = [104, ...values, checksum, 106];

  let x = 10;
  const rects: string[] = [];
  for (const symbol of symbols) {
    const pattern = CODE128_PATTERNS[symbol];
    let black = true;
    for (const char of pattern) {
      const width = Number(char);
      if (black) rects.push(`<rect x="${x}" y="0" width="${width}" height="38"/>`);
      x += width;
      black = !black;
    }
  }
  x += 10;
  return `<svg class="barcode-svg" viewBox="0 0 ${x} 48" role="img" aria-label="Code 128 ${escapeHtml(clean)}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${x}" height="48" fill="white"/>
    <g fill="black">${rects.join("")}</g>
    <text x="${x / 2}" y="47" text-anchor="middle" font-size="8" font-family="Arial,sans-serif" letter-spacing=".6">${escapeHtml(clean)}</text>
  </svg>`;
}


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
  if (!isValidEan13(code)) return code128BSvg(code);
  const bits = ean13Bits(code);
  const quiet = 9;
  const total = bits.length + quiet * 2;
  const bars = [...bits].map((bit, index) => bit === "1"
    ? `<rect x="${index + quiet}" y="0" width="1" height="34"/>`
    : "").join("");
  return `<svg class="barcode-svg" viewBox="0 0 ${total} 44" role="img" aria-label="EAN-13 ${escapeHtml(code)}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${total}" height="44" fill="white"/>
    <g fill="black">${bars}</g>
    <text x="${total / 2}" y="42" text-anchor="middle" font-size="7" font-family="Arial, sans-serif" letter-spacing="1">${escapeHtml(code)}</text>
  </svg>`;
}

export function buildBarcodeLabelHtml(
  product: Product,
  opts?: { copies?: number; categoryName?: string | null; autoPrint?: boolean; labelWidthMm?: number; labelHeightMm?: number }
): string {
  const shop = getShopProfile();
  const settings = getPrintSettings();
  const copies = Math.max(1, Math.min(100, opts?.copies ?? 1));
  const categoryName = opts?.categoryName ?? null;
  const autoPrint = opts?.autoPrint !== false;
  const labelWidthMm = Math.max(20, Math.min(120, Number(opts?.labelWidthMm ?? settings.labelWidthMm)));
  const labelHeightMm = Math.max(15, Math.min(150, Number(opts?.labelHeightMm ?? settings.labelHeightMm)));
  const codeValue = product.barcode || product.sku || product.id;
  const labelCodeMode = settings.labelCodeMode;
  const columns = settings.labelColumns === 2 ? 2 : 1;
  const rollWidthMm = columns === 2 ? settings.labelRollWidthMm : labelWidthMm;
  const pageHeightMm = labelHeightMm + (columns === 2 ? settings.labelRowGapMm : 0);
  const gapMm = columns === 2 ? settings.labelGapMm : 0;
  const availableMarginMm = rollWidthMm - (columns * labelWidthMm) - gapMm;
  if (availableMarginMm < 0) throw new Error("Sticker width + columns + gap exceed the configured roll width");
  const leftMarginMm = columns === 2 ? Math.min(settings.labelLeftMarginMm, availableMarginMm) : 0;
  let qrHtml = "";
  if (labelCodeMode !== "barcode") {
    try { qrHtml = qrSvg(codeValue, `QR ${codeValue}`); }
    catch (error) { qrHtml = `<span class="missing">${escapeHtml(error instanceof Error ? error.message : "Unable to encode QR")}</span>`; }
  }
  const labels = Array.from({ length: copies })
    .map(() => `
  <div class="label ${settings.labelLayout === "detailed" ? "detailed" : "compact"} ${labelHeightMm <= 25 ? "short" : ""}">
    <div class="shop">${escapeHtml(shop.shopName || "Minarva Biz")}</div>
    <div class="name">${escapeHtml(product.name)}</div>
    <div class="variant-attributes">
      ${product.size ? `<span>Size: ${escapeHtml(product.size)}</span>` : ""}
      ${product.color ? `<span>Colour: ${escapeHtml(product.color)}</span>` : ""}
      ${product.fabric ? `<span>Material: ${escapeHtml(product.fabric)}</span>` : ""}
    </div>
    ${[categoryName, product.size, product.color, product.brand].some(Boolean) ? `<div class="meta">${escapeHtml([categoryName, product.brand].filter(Boolean).join(" · "))}</div>` : ""}
    ${product.sku ? `<div class="sku">SKU: ${escapeHtml(product.sku)}</div>` : ""}
    <div class="codes ${labelCodeMode}">
      ${labelCodeMode !== "qr" ? `<div class="barcode">${barcodeSvg(codeValue)}</div>` : ""}
      ${labelCodeMode !== "barcode" ? `<div class="qr">${qrHtml}</div>` : ""}
    </div>
    <div class="price"><span class="retail-price">Price: ${formatMoney(product.mrp != null && product.mrp > 0 ? product.mrp : product.sellingPrice)}</span></div>
  </div>`);
  const blocks = Array.from({ length: Math.ceil(labels.length / columns) }, (_, index) =>
    `<div class="label-sheet">${labels.slice(index * columns, (index + 1) * columns).join("")}</div>`
  ).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Product Labels</title>
<style>
  /* One physical row per page. Do NOT size the body to the total roll length:
     fixed-height body clipping + explicit page breaks can create phantom pages
     in Chromium and shift every subsequent thermal label row. */
  @page{size:${rollWidthMm}mm ${pageHeightMm}mm;margin:0}
  *{box-sizing:border-box}
  html,body{width:${rollWidthMm}mm;height:auto;min-height:0;margin:0;padding:0;overflow:visible}
  body{font-family:Arial,sans-serif;color:#111}
  /* A sub-millimetre printable-area guard avoids fractional-pixel overflow
     introducing an extra page at the exact media-size boundary. */
  .label-sheet{width:${rollWidthMm}mm;height:calc(${pageHeightMm}mm - .25mm);padding-left:${leftMarginMm}mm;display:grid;grid-template-columns:repeat(${columns},${labelWidthMm}mm);column-gap:${gapMm}mm;align-content:start;page-break-after:auto;break-after:auto;break-inside:avoid;page-break-inside:avoid;overflow:hidden}\n  .label{width:${labelWidthMm}mm;height:calc(${labelHeightMm}mm - .25mm);padding:1.1mm;text-align:center;border:1px dashed #bbb;display:flex;flex-direction:column;align-items:stretch;justify-content:space-between;gap:.3mm;overflow:hidden;break-inside:avoid}
  .label.short{padding:1.1mm .85mm 1.2mm;gap:.1mm;min-height:0}

  .shop,.name,.meta,.sku{display:block;flex:0 1 auto;min-height:0;line-height:1.08;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .shop{font-size:9px;color:#475569}
  .name{font-size:11px;font-weight:700}
  .meta,.sku{font-size:8px}
  .variant-attributes{display:flex;flex:0 0 auto;align-items:center;justify-content:center;flex-wrap:wrap;gap:.4mm 1mm;font-size:8px;font-weight:700;line-height:1.1}
  .variant-attributes:empty{display:none}
  .variant-attributes span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .label.compact .meta,.label.compact .sku,.label.short .shop,.label.short .meta,.label.short .sku{display:none}
  .codes{display:flex;flex:1 1 7mm;align-items:center;justify-content:center;gap:1mm;min-height:4mm;max-height:11mm;margin:0;overflow:hidden}
  .barcode,.qr{height:100%;min-height:0;min-width:0;display:flex;align-items:center;justify-content:center}
  .codes.barcode .barcode{width:100%}.codes.qr .qr{width:100%}
  .codes.both .barcode{width:68%}.codes.both .qr{width:30%}
  .label.short .codes.both{max-height:8mm;gap:.35mm}
  .label.short .qr-svg{max-width:7.6mm;max-height:7.6mm}
  .label.short .variant-attributes{font-size:6.7px;line-height:1.04;white-space:nowrap;flex-wrap:nowrap;gap:.25mm;overflow:hidden;max-height:3.2mm}
  .barcode-svg{display:block;max-width:100%;width:100%;height:100%;max-height:11mm;margin:0 auto}
  .label.short .barcode-svg{max-height:8mm}
  .qr-svg{display:block;width:100%;height:100%;max-width:11mm;max-height:11mm;margin:0 auto}
  .missing{font-size:8px;color:#b91c1c}
  .price{flex:0 0 auto;display:flex;flex-direction:column;gap:0;align-items:center;font-size:10px;line-height:1.05;font-weight:800;white-space:nowrap;overflow:hidden}\n  .retail-price{font-size:11px;font-weight:800}
  .label.short .name{font-size:8.7px;line-height:1.0}
  .label.short .price{font-size:9.6px;line-height:1;min-height:3.3mm;justify-content:center}
  .label.short .retail-price{font-size:10px}
  .label.short .codes{flex:0 1 8mm;max-height:8mm;min-height:5.5mm}
  @media print{
    .label{border:0}
    /* Explicit media feed at EACH label row, never one long scaled page. */
    .label-sheet{break-after:page;page-break-after:always}
    .label-sheet:last-child{break-after:auto;page-break-after:auto}
  }
</style></head><body>${blocks}
${autoPrint ? "<script>window.onload=function(){window.print()}</script>" : ""}</body></html>`;
}

/** The operator can review the exact two-up layout in the app before sending
 * it straight to their chosen printer, bypassing unreliable Windows previews.
 * This response confirms job acceptance only, not physical paper output. */
export async function sendBarcodeLabelsToPrinter(
  product: Product,
  copies = 1,
  categoryName?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === "undefined") return { ok: false, error: "Windows desktop printing is unavailable" };
  const settings = getPrintSettings();
  if (!settings.labelPrinterName) {
    return { ok: false, error: "Select the dedicated Barcode label printer in Settings → Printer settings (not the POS receipt printer)." };
  }
  try {
    const html = buildBarcodeLabelHtml(product, { copies, categoryName, autoPrint: false });
    const result = requestDesktopPrintHtml(html, "label", {
      labelWidthMm: settings.labelColumns === 2 ? settings.labelRollWidthMm : settings.labelWidthMm,
      labelHeightMm: settings.labelHeightMm + (settings.labelColumns === 2 ? settings.labelRowGapMm : 0),
      silent: true,
    });
    return result ? await result : { ok: false, error: "Windows desktop printer bridge is unavailable" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function printBarcodeLabels(product: Product, copies = 1, categoryName?: string | null) {
  if (typeof window === "undefined") return;
  const settings = getPrintSettings();
  const directHtml = buildBarcodeLabelHtml(product, {
    copies,
    categoryName,
    autoPrint: false,
    labelWidthMm: settings.labelWidthMm,
    labelHeightMm: settings.labelHeightMm,
  });
  if (tryDesktopPrintHtml(directHtml, "label", {
    labelWidthMm: settings.labelColumns === 2 ? settings.labelRollWidthMm : settings.labelWidthMm,
    labelHeightMm: settings.labelHeightMm + (settings.labelColumns === 2 ? settings.labelRowGapMm : 0),
  })) return;

  const w = window.open("", "_blank", "width=500,height=700");
  if (!w) return;
  w.document.write(buildBarcodeLabelHtml(product, {
    copies,
    categoryName,
    autoPrint: true,
    labelWidthMm: settings.labelWidthMm,
    labelHeightMm: settings.labelHeightMm,
  }));
  w.document.close();
}


export function printProductLabels(products: Product[], copies = 1) {
  for (const p of products) printBarcodeLabels(p, copies);
}
