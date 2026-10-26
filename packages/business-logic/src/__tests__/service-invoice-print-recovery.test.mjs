import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const invoice = read("packages/business-logic/src/invoice.ts");
const detail = read("packages/ui/src/components/orders/OrderDetail.tsx");

test("service invoice print returns an explicit recoverable result", () => {
  assert.match(invoice, /export function requestOrderInvoicePrint\(/);
  assert.match(invoice, /requestDesktopPrintHtml\(directHtml, selectedPaper\)/);
  assert.match(invoice, /Print window was blocked\. Allow popups for this app, then retry the saved service invoice\./);
  assert.match(invoice, /popup\.close\(\)/);
  assert.match(invoice, /browser-window-opened/);
  assert.match(invoice, /native-accepted/);
});

test("service order detail surfaces print result and offers saved-invoice retries", () => {
  assert.match(detail, /requestOrderInvoicePrint/);
  assert.match(detail, /role=\{printNotice\.state === "error" \? "alert" : "status"\}/);
  assert.match(detail, /Service invoice \\$\{order\.orderNumber\} was not printed:/);
  assert.match(detail, /Retry A4/);
  assert.match(detail, /Retry Thermal/);
  assert.doesNotMatch(detail, /printOrderInvoice/);
});
