import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = "apps/web/";
const mark = readFileSync(root+"public/minarva-biz-mark.svg", "utf8");
const icon = readFileSync(root+"src/app/icon.svg", "utf8");
const page = readFileSync(root+"src/app/page.tsx", "utf8");
const tour = readFileSync(root+"src/app/ProductTourClient.tsx", "utf8");
const layout = readFileSync(root+"src/app/layout.tsx", "utf8");

assert.equal(mark, icon, "Browser favicon and homepage mark must share same identity");
assert.match(mark, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
assert.match(mark, /viewBox="0 0 120 100"/);
assert.match(mark, /linearGradient/);
assert.match(mark, /Minarva Biz/);
assert.doesNotMatch(mark, /<script|<foreignObject|<image|https:\/\//i, "Logo must be self-contained and safe to host");
assert.ok(mark.length < 8000, "Keep branding portable and lightweight");
assert.match(page, /src="\/minarva-biz-mark\.svg"/, "Homepage header/footer must use approved new mark");
assert.match(tour, /src="\/minarva-biz-mark\.svg"/, "Product tour must share branding");
assert.doesNotMatch(page, /src="\/logo-mark\.png"/, "Old boutique brand should not appear in public header");
assert.doesNotMatch(layout, /Commercial Boutique Billing & Management Software/);
assert.match(layout, /business management software/);
assert.match(page, /Minarva Biz home/);
console.log("Cross-industry Minarva Biz logo branding contract PASS");
