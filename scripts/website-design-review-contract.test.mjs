import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";

const html = readFileSync("docs/previews/minarva-biz-premium-design-review.html", "utf8");
assert.ok(html.startsWith("<!doctype html>"), "Standalone preview must be a portable HTML document");
assert.match(html, /<meta name="viewport"/);
assert.match(html, /<meta name="robots" content="noindex,nofollow"/);
assert.match(html, /DESIGN REVIEW PREVIEW/);
assert.match(html, /not an actual customer screenshot/);
assert.match(html, /not connected to production accounts/);
assert.match(html, /Sample records|Sample invoices/);
assert.match(html, /@media\(max-width:700px\)/, "Mobile layout must exist");
for (const anchor of ["home", "tour", "features", "industries", "editions", "download"]) {
  assert.ok(html.includes('id="' + anchor + '"'), "Missing visible section: " + anchor);
}
for (const tab of ["billing", "stock", "service", "reports"]) {
  assert.ok(html.includes('id="tab-' + tab + '"'), "Missing tab: " + tab);
  assert.ok(html.includes('id="panel-' + tab + '"'), "Missing tab panel: " + tab);
  assert.ok(html.includes('data-tab="' + tab + '"'), "Missing controlled tab: " + tab);
}
assert.match(html, /role="tablist"/);
assert.match(html, /aria-controls="panel-billing"/);
assert.match(html, /aria-selected="true"/);
assert.match(html, /event\.preventDefault\(\)/, "Keyboard navigation must work");
assert.match(html, /rel="noopener noreferrer"/, "Release link must be isolated");
assert.match(html, /releases\/tag\/v1\.0\.15/, "Only published installer release may be offered");
assert.doesNotMatch(html, /<iframe|<form|<input[^>]*type=["']password/i);
assert.doesNotMatch(html, /<script[^>]*src=|<link[^>]*href=["']https?:/i, "No third-party script/font dependencies");
assert.doesNotMatch(html, /Trusted by \d|customer testimonials|active businesses served/i);
const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g), (x) => x[1]);
assert.equal(scripts.length, 1, "Use exactly one isolated, dependency-free tour script");
new Script(scripts[0], { filename: "minarva-design-review-browser.js" });
console.log("Standalone product website design preview contract PASS");
