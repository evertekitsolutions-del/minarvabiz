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
assert.doesNotMatch(html, /<form[^>]*action=["']?\/signup/i, "Must not present nonfunctional signup as live");
const login = await fetch(new URL("/login", baseUrl), { redirect: "manual" });
assert.equal(login.status, 200, "Existing customer login route must remain available");
console.log("Public homepage smoke PASS: 200, no redirect, CSP, sections, release, existing login");
