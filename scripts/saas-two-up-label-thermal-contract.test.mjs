import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

test("38mm × 25mm two-up labels use one zero-margin fixed pitch row per page",()=>{
 const s=readFileSync("packages/business-logic/src/saas-print-documents.ts","utf8");
 assert.match(s,/@page\{size:76mm 25mm;margin:0\}/);
 assert.match(s,/grid-template-columns:38mm 38mm/);
 assert.match(s,/height:24\.70mm/);
 assert.match(s,/break-after:page/);
 assert.match(s,/sheet:last-child\{break-after:auto/);
 assert.match(s,/Price ₹/);
 assert.match(s,/barcodeSvg\(code\)/);
 assert.match(s,/qrSvg\(code/);
 assert.doesNotMatch(s,/>MRP/);
});
test("80mm thermal receipt has no forced length, cut or blank trailing page",()=>{
 const s=readFileSync("packages/business-logic/src/saas-print-documents.ts","utf8");
 assert.match(s,/buildSaasThermal80mmReceipt/);
 assert.match(s,/width:72mm!important/);
 assert.match(s,/height:auto!important/);
 assert.match(s,/page-break-after:auto/);
 assert.doesNotMatch(s,/printBarcodeLabels\(/);
 assert.doesNotMatch(s,/requestDesktopPrintHtml\(/);
});
test("cloud product and POS use browser print/PDF from Supabase-confirmed data",()=>{
 const product=readFileSync("apps/web/src/app/(app)/products/page.tsx","utf8");
 const sales=readFileSync("apps/web/src/app/(app)/sales/saas-cloud-pos.tsx","utf8");
 const productUi=readFileSync("apps/web/src/app/(app)/products/saas-label-print-panel.tsx","utf8");
 assert.match(product,/<SaasLabelPrintPanel products=\{products\}/);
 assert.match(productUi,/buildSaasTwoUp38x25Labels/);
 assert.match(productUi,/Save as PDF/);
 assert.match(sales,/buildSaasThermal80mmReceipt/);
 assert.match(sales,/Print 80mm \/ Save PDF/);
});
