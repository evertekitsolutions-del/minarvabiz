import assert from "node:assert/strict";

const expected = "https://minarvabiz-customer-web-preview.minarva-biz.workers.dev";
const supplied = process.env.MINARVA_CLOUDFLARE_PREVIEW_URL;
assert.equal(new URL(supplied).origin, expected, "Never probe a production domain");
const fetchPage = (path) => fetch(new URL(path, expected), {
  redirect: "manual",
  cache: "no-store",
  signal: AbortSignal.timeout(20_000),
});
const response = await fetchPage("/");
assert.equal(response.status, 200);
assert.match(response.headers.get("content-security-policy") || "", /nonce-/);
assert.equal(response.headers.get("x-content-type-options"), "nosniff");
const html = await response.text();
for (const phrase of ["Manage Your Business", "Smarter with", "Windows Offline", "GST & Accounting", "Service Management"]) {
  assert.ok(html.includes(phrase), "Cloudflare preview is stale or incomplete: " + phrase);
}
for (const section of ["features", "industries", "product-tour", "editions", "download", "faq"]) {
  assert.ok(html.includes('id="' + section + '"'), "Missing anchor: " + section);
}
assert.ok(html.includes('href="/login"'), "Customer login must remain reachable");
assert.ok(html.includes("releases/tag/v1.0.15"), "Only published installer may be offered");
assert.doesNotMatch(html, /sb_secret_|BEGIN (?:RSA |EC )?PRIVATE KEY/);
const login = await fetchPage("/login");
assert.equal(login.status, 200, "Existing customer login must stay intact");
console.log("Premium Cloudflare customer preview live acceptance PASS:", expected);
