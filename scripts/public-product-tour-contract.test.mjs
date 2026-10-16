import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("apps/web/src/app/page.tsx", "utf8");
const tour = readFileSync("apps/web/src/app/ProductTourClient.tsx", "utf8");

assert.ok(page.includes('id="product-tour"'), "Marketing page must offer a visible product tour");
assert.ok(page.includes('href: "#product-tour"'), "Header navigation must offer direct tour access");
assert.ok(page.includes("<ProductTourClient />"), "Render the interactive tour in the marketing page");
assert.ok(page.includes('href="#product-tour"'), "Hero CTA must lead to product tour");
assert.match(tour, /"use client";/, "Product tour must be interactive");
assert.match(tour, /useState/, "Use controlled client-side panel selection");
for (const panel of ["Billing", "Inventory", "Service desk", "Reports"]) {
  assert.ok(tour.includes('label: "' + panel + '"'), "Missing visible product workflow: " + panel);
}
assert.match(tour, /role="tablist"/);
assert.match(tour, /role="tab"/);
assert.match(tour, /aria-selected=/);
assert.match(tour, /role="tabpanel"/);
assert.match(tour, /aria-controls=/);
assert.match(tour, /Illustrative product walkthrough/, "Never represent sample UI as verified real screenshots");
assert.ok(!tour.includes("Trusted by 1.5 Cr"), "No competitor testimonials or borrowed stats");
assert.doesNotMatch(tour, /setInterval|window\.|localStorage|<script/, "Tour must not leak browser state or inject scripts");
console.log("Interactive product marketing tour contract PASS");
