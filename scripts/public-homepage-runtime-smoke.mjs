import assert from "node:assert/strict";

const baseUrl = process.env.MINARVA_WEB_SMOKE_URL || "http://127.0.0.1:3000";
const response = await fetch(new URL("/", baseUrl), { redirect: "manual", headers: { Accept: "text/html" } });
assert.equal(response.status, 200, "Public homepage must respond 200 without authentication or redirect");
assert.match(response.headers.get("content-type") || "", /text\/html/i);
assert.ok(response.headers.get("content-security-policy"), "Public homepage must keep the nonce CSP");
const html = await response.text();
for (const fragment of ['Minarva Biz', 'id="features"', 'id="industries"', 'id="editions"', 'id="download"', 'id="faq"', 'href="/login"', '/minarvabiz/releases/tag/v1.0.15']) {
  assert.ok(html.includes(fragment), `Missing public homepage contract: ${fragment}`);
}
for (const fragment of ['aria-label="Mobile navigation"', 'aria-label="Main navigation"', '<summary', 'Browse sections']) {
  assert.ok(html.includes(fragment), `Missing responsive accessible navigation: ${fragment}`);
}
assert.doesNotMatch(html, /<form[^>]*action=["']?\/signup/i, "Must not present nonfunctional signup as live");
for (const [urlPath, markers] of [
  ["/solutions", ["Manage. Sell. Serve.", "Online Store / E-commerce", "Staff & Attendance", "In development"]],
  ["/pricing", ["Starter", "Business Pro", "Business 360", "Pricing to be confirmed"]],
  ["/partners", ["Partner With Us", "10%", "Referral", "not an active or legally binding commission offer"]],
]) {
  const publicPage = await fetch(new URL(urlPath, baseUrl), { redirect: "manual" });
  assert.equal(publicPage.status, 200, "Public marketing page must not require login: " + urlPath);
  assert.ok(publicPage.headers.get("content-security-policy"), "Marketing page must retain CSP: " + urlPath);
  const body = await publicPage.text();
  for (const marker of markers) {
    assert.ok(body.includes(marker), urlPath + " missing: " + marker);
  }
}
const login = await fetch(new URL("/login", baseUrl), { redirect: "manual" });
assert.equal(login.status, 200, "Existing customer login route must remain available");
console.log("Public homepage smoke PASS: 200, no redirect, CSP, sections, release, existing login");
