import assert from "node:assert/strict";
import fs from "node:fs";
import { parseServiceOrderPriceDraft } from "../service-order-price-draft.ts";

const base = {
  serviceType: "ladies_tailoring",
  price: "750.25",
  discount: "50.25",
  advance: "100.00",
  externalMaterialCost: "20",
  quantity: "1",
  unitPrice: "",
  bulkDiscount: "0",
};
const parsed = parseServiceOrderPriceDraft(base);
assert.deepEqual(parsed, {
  price: 750.25, discount: 50.25, advance: 100,
  externalMaterialCost: 20, quantity: 1, unitPrice: undefined, bulkDiscount: 0,
});
assert.equal(parseServiceOrderPriceDraft({ ...base, price: "0", discount: "0", advance: "0" }).price, 0);

const bulk = parseServiceOrderPriceDraft({
  ...base, serviceType: "wholesale", price: "",
  quantity: "3", unitPrice: "100.10", bulkDiscount: ".30",
  discount: "0", advance: "300.00",
});
assert.equal(bulk.price, 300.3);
assert.equal(bulk.quantity, 3);
assert.equal(bulk.unitPrice, 100.1);
assert.equal(bulk.bulkDiscount, 0.3);
assert.equal(bulk.advance, 300);

for (const badPrice of ["", " ", "-1", "12abc", "1e500", "0x10", "Infinity", "1.234", "9999999999999999999"]) {
  assert.throws(() => parseServiceOrderPriceDraft({ ...base, price: badPrice }), /Price.*valid|Price.*range/);
}
for (const badQty of ["", "0", "-1", "1.5", "3abc", "1e3", "99999999999999999999"]) {
  assert.throws(() => parseServiceOrderPriceDraft({ ...base, serviceType: "uniform", price: "", unitPrice: "100", quantity: badQty }), /Quantity/);
}
assert.throws(() => parseServiceOrderPriceDraft({ ...base, discount: "800" }), /Discount cannot exceed/);
assert.throws(() => parseServiceOrderPriceDraft({ ...base, advance: "750" }), /Advance cannot exceed/);
assert.throws(() => parseServiceOrderPriceDraft({ ...base, externalMaterialCost: "-0.01" }), /External material cost/);
assert.throws(() => parseServiceOrderPriceDraft({ ...base, advance: "NaN" }), /Advance/);
assert.throws(() => parseServiceOrderPriceDraft({ ...base, serviceType: "uniform", price: "", quantity: "2", unitPrice: "" }), /Unit price/);

const ui = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/services/page.tsx", import.meta.url), "utf8");
const create = ui.match(/function handleCreate\(\) \{([\s\S]*?)\n  \}\n\n  function handleStatus/);
assert.ok(create, "service creation code must remain present");
assert.match(create[1], /parseServiceOrderPriceDraft\(form\)/);
assert.match(create[1], /catch \(err\)/);
assert.match(create[1], /customerPrice: pricing\.price/);
assert.doesNotMatch(create[1], /parseFloat\(form\./);
assert.doesNotMatch(create[1], /parseInt\(form\./);
console.log("Service order pricing form validation and creation wiring PASS");
