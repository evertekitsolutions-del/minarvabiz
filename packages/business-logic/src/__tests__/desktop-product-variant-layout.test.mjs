import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const ts = createRequire(import.meta.url)("typescript");

const editor = fs.readFileSync(
  new URL("../../../../apps/desktop/src/components/ProductEditorModal.tsx", import.meta.url), "utf8",
);
const variants = fs.readFileSync(
  new URL("../../../../apps/desktop/src/components/ProductVariantRows.tsx", import.meta.url), "utf8",
);
const family = fs.readFileSync(new URL("../product-variant-family.ts", import.meta.url), "utf8");

test("product and variant forms remain valid TypeScript JSX for Windows packaging", () => {
  for (const [name, source] of [["ProductEditorModal.tsx", editor], ["ProductVariantRows.tsx", variants]]) {
    const tree = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    assert.deepEqual(tree.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\\n")), [], name);
  }
});

test("individual products may generate a barcode, but variant groups never show a second parent barcode field", () => {
  assert.match(editor, /\{!productForm\.hasVariants&&<FormField label="Barcode">/);
  assert.match(editor, /onGenerateBarcode\(\)/);
  assert.match(editor, /onEnabledChange=\{enabled=>setProductForm\(v=>\(\{\.\.\.v,hasVariants:enabled,stockQuantity:enabled\?"":v\.stockQuantity,barcode:enabled\?"":v\.barcode\}\)\)\}/);
  assert.match(family, /createProduct\(\{ \.\.\.input, barcode: null,/);
  assert.match(family, /row\.barcode \|\| generateProductBarcode\(/);
});

test("all seven variant inputs have responsive full-width rows instead of unreadable seven columns", () => {
  assert.match(editor, /<Modal className="max-w-5xl"/);
  assert.match(variants, /grid grid-cols-1 gap-3 [^"]* sm:grid-cols-2 lg:grid-cols-3/);
  assert.doesNotMatch(variants, /sm:grid-cols-7/);
  for (const name of ["Brand", "Size", "Colour", "Fabric", "Quantity (pcs) *", "SKU (optional)", "Barcode (auto if blank)"]) {
    assert(variants.includes(`<FormField label="${name}">`), `Missing variant entry: ${name}`);
  }
  assert.match(variants, /auto-generate a unique code on Save/);
  assert.match(variants, /value=\{row\.quantity\}/);
  assert.match(variants, /onRowsChange\(rows\.filter\(/);
});
