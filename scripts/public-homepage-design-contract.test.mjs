import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source-level safety checks complement the production web/Worker runtime and browser smoke gates.
const page = readFileSync("apps/web/src/app/page.tsx", "utf8");

for (const section of ["features", "industries", "editions", "faq"]) {
  assert.ok(page.includes('id="' + section + '"'), "Missing visible section: " + section);
  assert.ok(page.includes('href: "#' + section + '"'), "Missing navigation target: " + section);
}
for (const label of ["Main navigation", "Mobile navigation", "Footer navigation", "Skip to content"]) {
  assert.ok(page.includes(label), "Missing accessible landmark: " + label);
}
assert.ok(page.includes("<details") && page.includes("<summary"), "Native keyboard-friendly menus/FAQ required");
assert.ok(page.includes('href="/login"'), "Existing customer login must remain accessible");
assert.ok(page.includes('id="get-started"') && page.includes('href="/register"'), "SaaS registration CTA must remain visible");
assert.ok(page.includes("target=\"_blank\" rel=\"noopener noreferrer\""), "External release link must be isolated");
assert.ok(page.includes("not a live application screenshot"), "Illustrative panel must be disclosed");
assert.ok(page.includes("Subscription payments and full customer acceptance remain pending verification."), "Do not advertise an unverified paid subscription");
assert.ok(page.includes("subject to edition readiness") || page.includes("depends on edition"), "No universal feature claims");
for (const name of ["Online", "Mobile App", "Cloud Teams"]) {
  assert.ok(page.includes(name), "Edition must be represented: " + name);
}
assert.doesNotMatch(page, /<form[^>]*action=["']?\/signup/i, "Do not expose nonfunctional signup");
assert.doesNotMatch(page, /(?:href|src)=["']http:/i, "Homepage must not load insecure assets");
assert.doesNotMatch(page, /<script/i, "Homepage must not bypass existing request-bound CSP");
console.log("Premium public homepage source contract PASS");
