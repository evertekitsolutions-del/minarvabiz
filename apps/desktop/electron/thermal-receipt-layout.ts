/**
 * Thermal receipt safety: refuse blank/overflow layouts before the Windows
 * spooler is allowed to feed paper or cut a roll. This does not claim physical
 * printer acceptance; the driver and real roll must still be tested.
 */
export type ThermalReceiptPage =
  | { ok: true; heightMm: number; visibleLength: number }
  | { ok: false; error: string };

const MAX_PAGE_MM = 290;

export function planThermalReceiptFallback(html: string, widthMm: 58 | 80): ThermalReceiptPage {
  const printable = String(html)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|thinsp|ensp|emsp);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (printable.length < 5) return { ok: false, error: "Thermal receipt is empty. Printer feed and cut were cancelled." };
  const tableRows = (html.match(/<tr(?:\s|>)/gi) || []).length;
  const lineCharacters = widthMm === 58 ? 20 : 30;
  const minimumHeightMm = 55;
  // Conservative fallback only when Electron cannot query rendered DOM height.
  // Never silently clamp an overlong receipt and lose its bottom invoice lines.
  const estimateMm = Math.ceil(40 + Math.ceil(printable.length / lineCharacters) * 4
    + tableRows * 3.5);
  if (estimateMm > MAX_PAGE_MM) {
    return { ok: false, error: "Thermal receipt exceeds the safe single-page roll length. Use A4 or a shorter invoice; nothing was sent to the cutter." };
  }
  return { ok: true, heightMm: Math.max(minimumHeightMm, estimateMm), visibleLength: printable.length };
}

export function validateThermalReceiptDomMetrics(
  metrics: { text?: unknown; heightPx?: unknown },
): ThermalReceiptPage {
  const text = Number(metrics?.text);
  const pixels = Number(metrics?.heightPx);
  if (!Number.isFinite(text) || text < 5 || !Number.isFinite(pixels) || pixels <= 0) {
    return { ok: false, error: "Thermal receipt did not render printable content. Feed and cut cancelled." };
  }
  const heightMm = Math.ceil(pixels * 25.4 / 96 + 10);
  if (heightMm > MAX_PAGE_MM) {
    return { ok: false, error: "Thermal receipt is too long for one safely sized page. Use A4 or shorten the invoice." };
  }
  return { ok: true, heightMm: Math.max(40, heightMm), visibleLength: text };
}
