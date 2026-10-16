import assert from "node:assert/strict";
import fs from "node:fs";
import { buildManualServiceWhatsAppLink, availableServiceWhatsAppTemplates } from "../manual-service-whatsapp.ts";
import { parseGoogleReviewUrl } from "../google-review-link.ts";

const order = (status, deliveryDate = "2026-10-20", balance = 125) => ({ status, deliveryDate, balance });
const options = (data) => availableServiceWhatsAppTemplates(data).map((x) => x.id);
assert.deepEqual(options(order("cancelled")), []);
assert.deepEqual(options(order("delivered")), ["payment_due", "feedback_request"]);
assert.ok(options(order("qc")).includes("trial_ready"));
assert.ok(!options(order("qc")).includes("feedback_request"));
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
assert.equal(parseGoogleReviewUrl("  https://g.page/r/ABC/review  "), "https://g.page/r/ABC/review");
assert.equal(parseGoogleReviewUrl("https://search.google.com/local/writereview?placeid=ABC"), "https://search.google.com/local/writereview?placeid=ABC");
assert.equal(parseGoogleReviewUrl(""), "");
for (const url of ["http://g.page/r/ABC/review", "javascript:alert(1)", "https://g.page.evil.invalid/review", "https://g.page@evil.invalid/review", "https://example.org/review", "not a url"]) {
  assert.throws(() => parseGoogleReviewUrl(url), /Google review/);
}
const shopSettings = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/settings/page.tsx", import.meta.url), "utf8");
assert.match(shopSettings, /label="Google review link"/);
assert.match(shopSettings, /parseGoogleReviewUrl\(shop\.googleReviewUrl \?\? ""\)/);
assert.match(shopSettings, /role=\{shopMsgIsError \? "alert" : "status"\}/);

const templates = fs.readFileSync(new URL("../notification-templates.ts", import.meta.url), "utf8");
assert.match(templates, /amount: formatMoney\(order\.balance\)/, "payment_due must not show undefined");
assert.match(templates, /parseGoogleReviewUrl\(getShopProfile\(\)\.googleReviewUrl \?\? ""\)/, "only validated Google review URL may be inserted");

const orderDetail = fs.readFileSync(new URL("../../../ui/src/components/orders/OrderDetail.tsx", import.meta.url), "utf8");
const servicesPage = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/services/page.tsx", import.meta.url), "utf8");
assert.match(orderDetail, /availableServiceWhatsAppTemplates\(order\)/);
assert.match(orderDetail, /onClick=\{shareStatusViaWhatsApp\}/);
assert.match(orderDetail, /disabled=\{!selectedWhatsAppTemplate\}/);
assert.match(orderDetail, /nothing is sent automatically/i, "must clearly mark manual send");
assert.match(orderDetail, /role="alert" className="text-sm text-rose-700">\{whatsAppError\}/);
assert.match(servicesPage, /onShareWhatsApp=\{\(templateId: TemplateId\) => \{/);
assert.match(servicesPage, /store\.getCustomer\(selected\.customerId\)/);
assert.match(servicesPage, /templateForOrder\(templateId, selected, contact\)\.body/);
assert.match(servicesPage, /buildManualServiceWhatsAppLink\(/);
assert.match(servicesPage, /window\.open\(url, "_blank", "noopener,noreferrer"\)/);
assert.doesNotMatch(servicesPage, /sendWhatsAppMessage\(/, "no unattended WhatsApp sends");

console.log("Service WhatsApp allowed messages, customer phone normalization and no-send URL PASS");
