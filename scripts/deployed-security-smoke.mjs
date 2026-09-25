import assert from "node:assert/strict";
import fs from "node:fs";

const baseRaw = String(process.env.STAGING_BASE_URL || "").trim();
if (!baseRaw) throw new Error("STAGING_BASE_URL is required");
const base = new URL(baseRaw.endsWith("/") ? baseRaw : baseRaw + "/");
const allowHttpLocalhost = process.env.ALLOW_HTTP_LOCALHOST === "1";
const isLocalhost = ["127.0.0.1", "localhost", "::1"].includes(base.hostname);
if (base.protocol !== "https:" && !(allowHttpLocalhost && isLocalhost)) {
  throw new Error("Deployed security smoke requires HTTPS (HTTP is allowed only for explicit localhost CI staging)");
}

const policy = JSON.parse(fs.readFileSync(new URL("../security/staging-quality-policy.json", import.meta.url), "utf8"));

function route(pathname) {
  return new URL(pathname.replace(/^\//, ""), base).toString();
}

function cspDirective(csp, name) {
  return csp.split(";").map((part) => part.trim()).find((part) => part.startsWith(name + " ")) || "";
}

async function fetchRoute(pathname) {
  const response = await fetch(route(pathname), {
    redirect: "manual",
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
  });
  if (response.status >= 500) throw new Error(`${pathname} returned server error ${response.status}`);
  return response;
}

const tested = [];
for (const pathname of policy.documentPaths) {
  const response = await fetchRoute(pathname);
  if (response.status >= 400 && response.status !== 401 && response.status !== 403) {
    throw new Error(`${pathname} returned unexpected status ${response.status}`);
  }
  const h = response.headers;
  assert.equal(h.get("x-content-type-options"), policy.securityHeaders.xContentTypeOptions, `${pathname}: X-Content-Type-Options`);
  assert.equal(h.get("x-frame-options"), policy.securityHeaders.xFrameOptions, `${pathname}: X-Frame-Options`);
  assert.equal(h.get("referrer-policy"), policy.securityHeaders.referrerPolicy, `${pathname}: Referrer-Policy`);
  assert.equal(h.get("permissions-policy"), policy.securityHeaders.permissionsPolicy, `${pathname}: Permissions-Policy`);
  assert.equal(h.get("x-powered-by"), null, `${pathname}: X-Powered-By must not disclose framework`);

  const csp = String(h.get("content-security-policy") || "");
  assert.ok(csp, `${pathname}: Content-Security-Policy is required`);
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /form-action 'self'/);
  const scriptSrc = cspDirective(csp, "script-src");
  assert.ok(scriptSrc, `${pathname}: script-src directive is required`);
  assert.match(scriptSrc, /'nonce-[^']+'/);
  assert.match(scriptSrc, /'strict-dynamic'/);
  assert.doesNotMatch(scriptSrc, /'unsafe-inline'/);
  assert.doesNotMatch(scriptSrc, /'unsafe-eval'/);

  if (base.protocol === "https:") {
    assert.match(csp, /upgrade-insecure-requests/);
    const hsts = String(h.get("strict-transport-security") || "");
    const age = Number(/max-age=(\d+)/i.exec(hsts)?.[1] || 0);
    assert.ok(age >= policy.securityHeaders.strictTransportSecurityMinAgeSeconds, `${pathname}: HSTS max-age is below baseline`);
    if (policy.securityHeaders.requireIncludeSubDomains) assert.match(hsts, /includeSubDomains/i);
  }
  tested.push({ pathname, status: response.status });
}

const first = await fetchRoute("/login");
const second = await fetchRoute("/login");
const firstNonce = /'nonce-([^']+)'/.exec(String(first.headers.get("content-security-policy") || ""))?.[1];
const secondNonce = /'nonce-([^']+)'/.exec(String(second.headers.get("content-security-policy") || ""))?.[1];
assert.ok(firstNonce && secondNonce, "nonce must exist on repeated requests");
assert.notEqual(firstNonce, secondNonce, "CSP nonce must rotate per request");

console.log("DEPLOYED_SECURITY_HEADERS PASS", JSON.stringify({ base: base.origin, tested, nonceRotation: true }));
