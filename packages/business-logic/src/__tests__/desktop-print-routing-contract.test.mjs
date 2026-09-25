import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const invoice = read("packages/business-logic/src/invoice.ts");
const receipt = read("packages/business-logic/src/receipt.ts");
const labels = read("packages/business-logic/src/barcode-labels.ts");
const bridge = read("packages/business-logic/src/desktop-print.ts");
const main = read("apps/desktop/electron/main.ts");
const settings = read("packages/business-logic/src/print-settings.ts");

for (const source of [invoice, receipt, labels]) {
  assert.match(source, /tryDesktopPrintHtml/);
}
assert.match(bridge, /paper: DesktopPrintPaper/);
assert.match(bridge, /silentDesktopPrint/);
assert.match(main, /"a4" \| "thermal" \| "label"/);
assert.match(main, /labelWidthMm/);
assert.match(main, /labelHeightMm/);
assert.match(main, /silent,/);
assert.match(settings, /labelPrinterName/);
assert.match(settings, /labelWidthMm/);
assert.match(settings, /labelHeightMm/);
assert.match(labels, /tryDesktopPrintHtml\(directHtml, "label"/);

console.log("Desktop bill/receipt/label print routing contract PASS");
