import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const page=readFileSync("apps/web/src/app/page.tsx","utf8");
const css=readFileSync("apps/web/src/app/globals.css","utf8");
for (const target of [
  "Manage Your Business", "Smarter with", "Minarva Biz",
  "Billing & POS", "Inventory", "GST & Accounting", "Service Management",
  "Tailoring", "Laundry", "Customers & CRM", "Reports & Analytics",
  "Retail Store", "Boutique & Fashion", "Service Centers", "Wholesale",
  "Online", "Windows Offline", "Hybrid",
]) assert.ok(page.includes(target),"Approved mockup concept missing: "+target);
assert.match(page,/id="product-tour"/);
assert.match(page,/import ProductTourClient/);
assert.match(page,/<ProductTourClient \/>/);
assert.match(page,/min-h-screen.*bg-white|bg-white.*min-h-screen/,"Approved bright white page background");
assert.match(page,/text-\[#(?:0b|10|12|13|15|17)[0-9a-f]{4}\]/i,"Dark navy business headline/palette");
assert.match(page,/(?:bg-\[#(?:0|1)[0-9a-f]{5}\]|bg-blue-600)/i,"Brand blue CTA");
assert.match(page,/src="\/marketing-dashboard\.jpg"/,"Use real repository-owned design reference asset");
assert.match(page,/not a live application screenshot/,"Never represent old design reference as real installed app");
assert.match(page,/role="img"|alt="[^"]+"/,"Visual accessible to assistive technology");
assert.match(page,/lg:grid-cols/,"Desktop two-column hero and layout");
assert.match(page,/grid-cols-2|sm:grid-cols-2/,"Responsive grid");
assert.match(page,/aria-label="Mobile navigation"/);
assert.match(page,/href="\/login"/);
assert.match(page,/releases\/tag\/v1\.0\.15/);
assert.ok(!page.includes("Free Trial"),"Do not advertise unavailable customer trials");
assert.ok(!page.includes("GST compliant"),"No unverified blanket compliance claims");
assert.doesNotMatch(page,/Trusted by (?:millions|lakhs|\d)/i);
assert.doesNotMatch(page,/<script|href="http:|src="http:/);
assert.match(css,/@tailwind base;/,"Retain app styling");
console.log("Approved Vyapar-calibre blue product homepage source contract PASS");
