import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { planThermalReceiptFallback, validateThermalReceiptDomMetrics } from "../thermal-receipt-layout.ts";

test("thermal receipt fallback estimates full physical roll height, not a tiny cut strip", () => {
  const html = "<html><head><style>body{color:black}</style></head><body><div class='sheet'><h2>INVOICE</h2>"
    + "<table>" + "<tr><td>ITEM ONE LONG DESCRIPTION</td><td>500.00</td></tr>".repeat(12)
    + "</table><p>Total 6000.00</p></div></body></html>";
  const receipt80 = planThermalReceiptFallback(html, 80);
  const receipt58 = planThermalReceiptFallback(html, 58);
  assert.equal(receipt80.ok, true);
  assert.equal(receipt58.ok, true);
  assert.ok(receipt80.heightMm >= 55 && receipt80.heightMm < 290);
  assert.ok(receipt58.heightMm >= receipt80.heightMm, "58mm rolls need more text wraps");
});

test("empty and oversized receipts fail before the cutter receives any job", () => {
  const blank = planThermalReceiptFallback("<html><style>body{display:none}</style> </html>", 80);
  assert.equal(blank.ok, false);
  assert.match(blank.error, /empty/i);
  const tooLong = planThermalReceiptFallback("<div>" + "INVOICE LONG ROW ".repeat(700) + "</div>", 80);
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.error, /exceeds/i);
});

test("real rendered metrics block blank, hidden and clipped receipt print jobs", () => {
  assert.equal(validateThermalReceiptDomMetrics({ text: 0, heightPx: 0 }).ok, false);
  assert.equal(validateThermalReceiptDomMetrics({ text: 100, heightPx: 0 }).ok, false);
  assert.equal(validateThermalReceiptDomMetrics({ text: 0, heightPx: 200 }).ok, false);
  assert.equal(validateThermalReceiptDomMetrics({ text: 100, heightPx: 1500 }).ok, false);
  const good = validateThermalReceiptDomMetrics({ text: 120, heightPx: 260 });
  assert.equal(good.ok, true);
  assert.ok(good.heightMm >= 40);
});

test("Electron thermal print validates DOM/fallback before Windows spooler callback", () => {
  const main = fs.readFileSync(new URL("../main.ts", import.meta.url), "utf8");
  const start = main.indexOf('if (paper === "thermal") {');
  const safety = main.indexOf("validateThermalReceiptDomMetrics(documentMetrics)", start);
  const fallback = main.indexOf("planThermalReceiptFallback(html, thermalWidthMm)", start);
  const spooler = main.indexOf("win.webContents.print({", start);
  assert.ok(start >= 0 && fallback > start && safety > fallback && spooler > safety);
  assert.ok(main.includes("if (!checked.ok) return { ok: false, error: checked.error }"));
  assert.ok(main.includes("if (!fallback.ok) return { ok: false, error: fallback.error }"));
  assert.ok(!main.includes("height: 297000"), "Receipt must never use A4-length hardcoded paper");
});
