import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("garment tags render escaped customer shop name, not a fixed Minarva Biz brand",()=>{
  const code=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryList.tsx",import.meta.url),"utf8");
  const open=code.indexOf("function printGarmentTags(");
  const end=code.indexOf("function downloadFilteredTickets(",open);
  assert(open>=0&&end>open);
  const labelPrinter=code.slice(open,end);
  assert.match(labelPrinter,/escapePrintHtml\(getShopProfile\(\)\.shopName/);
  assert.match(labelPrinter,/const shopName/);
  assert.match(labelPrinter,/<div class="brand">\$\{shopName\} · LAUNDRY<\/div>/);
  assert.doesNotMatch(labelPrinter,/MINARVA BIZ · LAUNDRY/);
  assert.match(labelPrinter,/code39Svg\(item\.tagCode\)/);
  assert.match(labelPrinter,/escapePrintHtml\(order\.customerName/);
});
