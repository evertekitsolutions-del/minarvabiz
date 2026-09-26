import assert from "node:assert/strict";
import fs from "node:fs";

function read(rel) {
  return fs.readFileSync(new URL(rel, import.meta.url), "utf8");
}

const helper = read("../html.ts");
const invoice = read("../invoice.ts");
const ledger = read("../customer-ledger.ts");
const receipt = read("../receipt.ts");
const quotations = read("../quotations.ts");
const delivery = read("../delivery.ts");
const barcode = read("../barcode-labels.ts");
const cash = read("../cash-register.ts");

assert.match(helper, /export function escapeHtml\(value: unknown\)/);
for (const entity of ["&amp;", "&lt;", "&gt;", "&quot;", "&#39;"]) {
  assert.ok(helper.includes(entity), `escapeHtml must encode ${entity}`);
}

for (const source of [invoice, ledger, receipt, quotations, delivery, barcode, cash]) {
  assert.match(source, /import \{ escapeHtml \} from "\.\/html";/);
}

assert.doesNotMatch(invoice, /function escapeHtml\(/);
assert.doesNotMatch(barcode, /function escape\(/);

assert.match(ledger, /escapeHtml\(e\.notes \|\| ""\)/);
assert.match(ledger, /escapeHtml\(stmt\.customerName\)/);

assert.match(receipt, /<title>\$\{escapeHtml\(sale\.invoiceNumber\)\}<\/title>/);
assert.match(receipt, /<title>\$\{escapeHtml\(order\.orderNumber\)\}<\/title>/);
assert.match(receipt, /const escaped = escapeHtml\(text\)/);

assert.match(quotations, /escapeHtml\((?:l|line)\.description\)/);
assert.match(quotations, /escapeHtml\(q\.customerName \|\| ""\)/);
assert.match(quotations, /escapeHtml\(q\.quotationNumber\)/);

assert.match(delivery, /<pre>\$\{escapeHtml\(text\)\}<\/pre>/);

assert.match(barcode, /escapeHtml\(product\.name\)/);
assert.match(barcode, /escapeHtml\(product\.sku\)/);
assert.match(barcode, /escapeHtml\(shop\.shopName \|\| "Minarva Biz"\)/);

assert.match(cash, /escapeHtml\(s\.closedBy \|\| "—"\)/);
assert.match(cash, /escapeHtml\(s\.businessDate\)/);

console.log("print HTML XSS hardening contract tests passed");
