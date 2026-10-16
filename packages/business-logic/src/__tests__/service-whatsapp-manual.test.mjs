import assert from "node:assert/strict";
import fs from "node:fs";
import { buildManualServiceWhatsAppLink, availableServiceWhatsAppTemplates } from "../manual-service-whatsapp.ts";

const order = (status, deliveryDate = "2026-10-20", balance = 125) => ({ status, deliveryDate, balance });
const options = (data) => availableServiceWhatsAppTemplates(data).map((x) => x.id);
assert.deepEqual(options(order("cancelled")), []);
assert.deepEqual(options(order("delivered")), ["payment_due"]);
assert.ok(options(order("qc")).includes("trial_ready"));
assert.ok(options(order("ready_to_deliver")).includes("order_ready"));
assert.ok(!options(order("processing")).includes("order_ready"));
assert.ok(!options(order("pending", null)).includes("delivery_reminder"));
assert.ok(!options(order("pending", "2026-10-20", Number.POSITIVE_INFINITY)).includes("payment_due"));
assert.ok(!options(order("pending", "2026-10-20", 0)).includes("payment_due"));

const message = "Dear customer, order ORD-005 is ready.\nAmount: ₹125 & thanks!";
assert.equal(buildManualServiceWhatsAppLink("+91 98765-43210", message),
  "https://wa.me/919876543210?text=" + encodeURIComponent(message));
assert.equal(buildManualServiceWhatsAppLink("9876543210", "Hello"),
  "https://wa.me/919876543210?text=Hello");
assert.equal(buildManualServiceWhatsAppLink("00919876543210", "Hello"),
  "https://wa.me/919876543210?text=Hello");
assert.equal(buildManualServiceWhatsAppLink("96891234567", "Hello"),
  "https://wa.me/96891234567?text=Hello");
for (const input of ["", "+", "+0", "123", "+91123", "javascript:alert(1)", "98765432100abc", "abc", "0", "+1234567890123456"]) {
  assert.throws(() => buildManualServiceWhatsAppLink(input, "Hello"), /WhatsApp number|country code/);
}
assert.throws(() => buildManualServiceWhatsAppLink("+919876543210", " \t"), /cannot be empty/);
const templates = fs.readFileSync(new URL("../notification-templates.ts", import.meta.url), "utf8");
assert.match(templates, /amount: formatMoney\(order\.balance\)/, "payment_due must not show undefined");
console.log("Service WhatsApp allowed messages, customer phone normalization and no-send URL PASS");
